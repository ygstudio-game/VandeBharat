<#
  RDSO_MVIS -- Setup & Health Check
  Machine Vision-based Inspection System
  -----------------------------------------------------------------
  Run this ANY TIME -- on a fresh clone, after a partial failure,
  or when something breaks. It scans every component, shows you a
  status table, then fixes only what is missing or broken.

  Usage:
      setup.bat              smart fix (repairs only what is broken)
      setup.bat --clean      force-rebuild all Python venvs from scratch

  Or directly in PowerShell:
      powershell -ExecutionPolicy Bypass -File .\setup.ps1
      powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Clean
#>

param([switch]$Clean)

$ErrorActionPreference = "SilentlyContinue"   # we handle errors ourselves
$root = $PSScriptRoot

# ================================================================================
#  BAKED-IN CREDENTIALS  (shared Neon DB + Cloudinary -- same for all developers)
# ================================================================================
$DB_URL     = 'postgresql://neondb_owner:npg_l5N8rTFfYvtU@ep-soft-sea-aog27v8w-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
$CLOUD_NAME = 'dpekqbt25'
$CLOUD_KEY  = '188155567875174'
$CLOUD_SEC  = 'cbAG3rHterwXs1UTRwO2-vpM9ls'

# ================================================================================
#  GOOGLE DRIVE MODEL WEIGHTS
# ================================================================================
$BEST_PT_GDRIVE_ID     = "1GyXpDMTBjqWgxtSxvKywVixU41nlpqaQ"   # best.pt
$DETECTOR_PT_GDRIVE_ID = "1YXRolLSe_q2ouz13ndFuF_g-WKVCUYk0"   # train_num_detector.pt

# ================================================================================
#  STATUS CONSTANTS
# ================================================================================
$OK      = "OK"
$MISSING = "MISSING"
$BROKEN  = "BROKEN"
$INFO    = "INFO"

# Repair results -- shown at the very end
$fixedItems  = [System.Collections.Generic.List[string]]::new()
$failedItems = [System.Collections.Generic.List[string]]::new()

# ================================================================================
#  DISPLAY HELPERS
# ================================================================================
function Print-Row($status, $label, $detail = "") {
    $pad = 36
    switch ($status) {
        $OK      { Write-Host "  [OK]  $($label.PadRight($pad)) $detail" -ForegroundColor Green }
        $MISSING { Write-Host "  [--]  $($label.PadRight($pad)) $detail" -ForegroundColor Red }
        $BROKEN  { Write-Host "  [!!]  $($label.PadRight($pad)) $detail" -ForegroundColor DarkYellow }
        $INFO    { Write-Host "  [ii]  $($label.PadRight($pad)) $detail" -ForegroundColor Cyan }
        default  { Write-Host "  [??]  $($label.PadRight($pad)) $detail" -ForegroundColor Gray }
    }
}

function Print-Section($title) {
    Write-Host ""
    Write-Host "  $title" -ForegroundColor White
    Write-Host ("  " + ("-" * 60)) -ForegroundColor DarkGray
}

function Print-Action($msg) { Write-Host "  >>  $msg" -ForegroundColor Cyan }
function Print-Ok($msg)     { Write-Host "  OK  $msg" -ForegroundColor Green }
function Print-Fail($msg)   { Write-Host " ERR  $msg" -ForegroundColor Red }
function Print-Info($msg)   { Write-Host "      $msg" -ForegroundColor Gray }

# UTF-8 without BOM (Python + Node both require this)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# ================================================================================
#  TEST FUNCTIONS -- return $OK / $MISSING / $BROKEN
# ================================================================================

# Returns the Python 3.13+ executable path, or $null
function Find-Python313 {
    # 1. Python Launcher (most reliable on Windows)
    if (Get-Command py -ErrorAction SilentlyContinue) {
        $v = & py -3.13 --version 2>&1
        if ($LASTEXITCODE -eq 0 -and "$v" -match "3\.(1[3-9]|\d{2,})") {
            $exe = (& py -3.13 -c "import sys; print(sys.executable)" 2>&1).Trim()
            if ($exe -and (Test-Path $exe)) { return $exe }
        }
    }
    # 2. 'python' on PATH
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) {
        $v = & python --version 2>&1
        if ("$v" -match "3\.(1[3-9]|\d{2,})") { return $cmd.Source }
    }
    # 3. 'python3' on PATH
    $cmd3 = Get-Command python3 -ErrorAction SilentlyContinue
    if ($cmd3) {
        $v = & python3 --version 2>&1
        if ("$v" -match "3\.(1[3-9]|\d{2,})") { return $cmd3.Source }
    }
    # 4. Common install paths
    $guesses = @(
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python314\python.exe",
        "C:\Python313\python.exe",
        "C:\Python314\python.exe",
        "C:\Program Files\Python313\python.exe"
    )
    foreach ($p in $guesses) {
        if (Test-Path $p) {
            $v = & $p --version 2>&1
            if ("$v" -match "3\.(1[3-9]|\d{2,})") { return $p }
        }
    }
    return $null
}

# Checks venv health: existence, Python version inside, key package importable
function Test-Venv($svcDir) {
    $venvPy = Join-Path $svcDir "venv\Scripts\python.exe"
    if (-not (Test-Path $venvPy)) { return @{ Status = $MISSING; Detail = "venv not found" } }

    $v = & $venvPy --version 2>&1
    if ($LASTEXITCODE -ne 0 -or "$v" -notmatch "3\.(1[3-9]|\d{2,})") {
        return @{ Status = $BROKEN; Detail = "wrong Python inside ($v) -- needs rebuild" }
    }
    $pyVer = ("$v" -replace "Python ", "").Trim()

    & $venvPy -c "import fastapi" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        return @{ Status = $BROKEN; Detail = "packages not installed" }
    }
    return @{ Status = $OK; Detail = "Python $pyVer, packages OK" }
}

# Checks npm install by looking for a key marker inside node_modules
function Test-NpmInstall($pkgDir, $marker) {
    $path = Join-Path $pkgDir "node_modules\$marker"
    if (Test-Path $path) { return $OK }
    return $MISSING
}

# Checks Prisma generated client
function Test-PrismaClient {
    $path = Join-Path $root "backend\node_modules\.prisma\client\index.js"
    if (Test-Path $path) { return $OK }
    return $MISSING
}

# Checks model weight file exists and is larger than $minMB
function Test-ModelFile($filePath, $minMB) {
    if (-not (Test-Path $filePath)) { return @{ Status = $MISSING; Detail = "file not found" } }
    $mb = [math]::Round((Get-Item $filePath).Length / 1MB, 1)
    if ($mb -lt $minMB) { return @{ Status = $BROKEN; Detail = "$mb MB -- file appears incomplete" } }
    return @{ Status = $OK; Detail = "$mb MB" }
}

# Checks .env file exists and has content
function Test-EnvFile($relPath) {
    $full = Join-Path $root $relPath
    if (-not (Test-Path $full)) { return $MISSING }
    if ((Get-Item $full).Length -lt 5) { return $BROKEN }
    return $OK
}

# ================================================================================
#  REPAIR FUNCTIONS -- called only for broken / missing items
# ================================================================================

function Repair-Venv($svc, $PY, $HasGPU) {
    Print-Action "Repairing venv: $svc"
    $dir = Join-Path $root $svc
    Push-Location $dir
    $ok = $true
    try {
        if (Test-Path "venv") {
            Print-Info "Removing old venv..."
            Remove-Item -Recurse -Force "venv" -ErrorAction Stop
        }
        Print-Info "Creating Python 3.13 venv..."
        & $PY -m venv venv
        if ($LASTEXITCODE -ne 0) { throw "venv create failed" }

        $vPy = ".\venv\Scripts\python.exe"
        Print-Info "Upgrading pip..."
        & $vPy -m pip install --upgrade pip --quiet
        if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }

        Print-Info "Installing requirements.txt..."
        & $vPy -m pip install -r requirements.txt --quiet --prefer-binary --no-cache-dir
        if ($LASTEXITCODE -ne 0) { throw "pip install requirements failed" }

        if ($svc -eq "GPU\yolo") {
            if ($HasGPU) {
                Print-Info "Installing PyTorch 2.6.0 + torchvision (CUDA cu124)..."
                & $vPy -m pip install torch==2.6.0 torchvision==0.21.0 `
                    --index-url https://download.pytorch.org/whl/cu124 --quiet
            } else {
                Print-Info "Installing PyTorch 2.6.0 + torchvision (CPU)..."
                & $vPy -m pip install torch==2.6.0 torchvision==0.21.0 --quiet
            }
            if ($LASTEXITCODE -ne 0) { throw "torch install failed" }
        }

        if ($svc -eq "GPU\ocr" -and $HasGPU) {
            Print-Info "Installing onnxruntime-gpu 1.20.1..."
            & $vPy -m pip install onnxruntime-gpu==1.20.1 --quiet
            if ($LASTEXITCODE -ne 0) { throw "onnxruntime-gpu install failed" }
        }

        Print-Ok "$svc venv ready."
        $script:fixedItems.Add("Venv: $svc")
    } catch {
        Print-Fail "$svc venv failed -- $_"
        $script:failedItems.Add("Venv: $svc -- $_")
        $ok = $false
    } finally {
        Pop-Location
    }
    return $ok
}

function Repair-Npm($pkg) {
    Print-Action "Installing npm packages: $pkg"
    $dir = Join-Path $root $pkg
    Push-Location $dir
    try {
        & npm install 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        Print-Ok "$pkg node_modules ready."
        $script:fixedItems.Add("npm: $pkg")
        return $true
    } catch {
        Print-Fail "$pkg npm install failed -- $_"
        $script:failedItems.Add("npm: $pkg -- $_")
        return $false
    } finally {
        Pop-Location
    }
}

function Repair-Prisma {
    Print-Action "Generating Prisma DB client..."
    $dir = Join-Path $root "backend"
    Push-Location $dir
    try {
        & npx prisma generate 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }
        Print-Ok "Prisma client generated."
        $script:fixedItems.Add("Prisma client")
        return $true
    } catch {
        Print-Fail "Prisma generate failed -- $_"
        $script:failedItems.Add("Prisma client -- $_")
        return $false
    } finally {
        Pop-Location
    }
}

function Repair-ModelFile($fileId, $destination, $label, $minMB) {
    Print-Action "Downloading $label from Google Drive..."
    try {
        $url = "https://drive.usercontent.google.com/download?id=$fileId&export=download&confirm=t"
        $wc  = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        $wc.DownloadFile($url, $destination)
        if (-not (Test-Path $destination)) { throw "file not saved" }
        $mb = [math]::Round((Get-Item $destination).Length / 1MB, 1)
        if ($mb -lt $minMB) { throw "downloaded file is only $mb MB -- check Drive sharing settings" }
        Print-Ok "$label downloaded ($mb MB)."
        $script:fixedItems.Add("Model: $label")
        return $true
    } catch {
        Print-Fail "$label download failed -- $_"
        $script:failedItems.Add("Model: $label -- $_")
        if (Test-Path $destination) { Remove-Item $destination -Force -ErrorAction SilentlyContinue }
        return $false
    }
}

function Repair-EnvFile($rel, $content) {
    $full = Join-Path $root $rel
    try {
        [System.IO.File]::WriteAllText($full, $content, $utf8NoBom)
        Print-Ok "Created: $rel"
        $script:fixedItems.Add("Env: $rel")
    } catch {
        Print-Fail "Could not write $rel -- $_"
        $script:failedItems.Add("Env: $rel -- $_")
    }
}

# ================================================================================
#  ENV FILE CONTENT BUILDERS
# ================================================================================
function Get-EnvContent($rel, $HasGPU) {
    $YOLO_DEVICE = if ($HasGPU) { "cuda:0" } else { "cpu" }
    $OCR_DEVICE  = if ($HasGPU) { "gpu"    } else { "cpu" }
    switch ($rel) {
        "backend\.env" {
            return @"
DATABASE_URL="$DB_URL"

CLOUDINARY_CLOUD_NAME=$CLOUD_NAME
CLOUDINARY_API_KEY=$CLOUD_KEY
CLOUDINARY_API_SECRET=$CLOUD_SEC

FRONTEND_URL=http://localhost:5173

FRAME_EXTRACTOR_URL=http://localhost:5003
OCR_SERVICE_URL=http://localhost:5000
YOLO_SERVICE_URL=http://localhost:5002
SYNC_ENGINE_URL=http://localhost:5004
CORRELATION_URL=http://localhost:5005
REPORT_GENERATOR_URL=http://localhost:5006

PORT=8001
BACKEND_URL=http://localhost:8001
NODE_ENV=development
"@
        }
        "GPU\yolo\.env" {
            return @"
YOLO_MODEL_PATH=models/best.pt
YOLO_OCR_MODEL_PATH=models/train_num_detector.pt

YOLO_DEVICE=$YOLO_DEVICE
YOLO_CONF=0.35
"@
        }
        "GPU\ocr\.env" {
            return @"
DATABASE_URL="$DB_URL"

YOLO_SERVICE_URL=http://localhost:5002/api/yolo/predict_train_number

OCR_DEVICE=$OCR_DEVICE
"@
        }
        "services\frame_extractor\.env" {
            return @"
DATABASE_URL="$DB_URL"

CLOUDINARY_CLOUD_NAME=$CLOUD_NAME
CLOUDINARY_API_KEY=$CLOUD_KEY
CLOUDINARY_API_SECRET=$CLOUD_SEC
"@
        }
        "services\sync_engine\.env" {
            return "DATABASE_URL=`"$DB_URL`""
        }
        "services\correlation\.env" {
            return @"
DATABASE_URL="$DB_URL"

YOLO_SERVICE_URL=http://localhost:5002/api/yolo/predict

CORRELATION_SAMPLE_N=3
"@
        }
        "services\report_generator\.env" {
            return @"
DATABASE_URL="$DB_URL"

CLOUDINARY_CLOUD_NAME=$CLOUD_NAME
CLOUDINARY_API_KEY=$CLOUD_KEY
CLOUDINARY_API_SECRET=$CLOUD_SEC
"@
        }
        "frontend\.env" {
            return "VITE_API_BASE_URL=http://localhost:8001"
        }
    }
}

# ================================================================================
#  BANNER
# ================================================================================
Write-Host ""
Write-Host "  +========================================================+" -ForegroundColor Cyan
Write-Host "  |   RDSO_MVIS  --  Setup & Health Check                  |" -ForegroundColor Cyan
Write-Host "  |   Machine Vision-based Inspection System                |" -ForegroundColor Cyan
Write-Host "  +========================================================+" -ForegroundColor Cyan
if ($Clean) {
    Write-Host "  MODE: Clean rebuild -- all Python venvs will be recreated" -ForegroundColor DarkYellow
}
Write-Host ""

# ================================================================================
#  PHASE 1 -- CHECK PREREQUISITES  (must have Python + Node to do anything)
# ================================================================================
Write-Host "  Scanning system..." -ForegroundColor Gray

$PY = Find-Python313
if (-not $PY) {
    Write-Host ""
    Write-Host "  [FATAL] Python 3.13+ not found." -ForegroundColor Red
    Write-Host "  Install from: https://www.python.org/downloads/" -ForegroundColor Red
    Write-Host "  Tick 'Add Python to PATH' during install, then re-run setup.bat" -ForegroundColor Red
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}
$pyVer = (& $PY --version 2>&1).ToString().Trim()

$hasNode = [bool](Get-Command node -ErrorAction SilentlyContinue)
$nodeVer = if ($hasNode) { (node --version 2>&1).ToString().Trim() } else { "" }
$hasNpm  = [bool](Get-Command npm  -ErrorAction SilentlyContinue)
$npmVer  = if ($hasNpm)  { (npm  --version 2>&1).ToString().Trim() } else { "" }

if (-not $hasNode) {
    Write-Host ""
    Write-Host "  [FATAL] Node.js not found." -ForegroundColor Red
    Write-Host "  Install Node.js 18+ from: https://nodejs.org/en/download" -ForegroundColor Red
    Write-Host "  Then re-run setup.bat" -ForegroundColor Red
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}
if ($nodeVer -match "v(\d+)" -and [int]$Matches[1] -lt 18) {
    Write-Host "  [FATAL] Node.js 18+ required (found $nodeVer)." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}

$HasGPU = $false
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    & nvidia-smi | Out-Null
    if ($LASTEXITCODE -eq 0) { $HasGPU = $true }
}

# ================================================================================
#  PHASE 2 -- SCAN ALL COMPONENTS
# ================================================================================
$svcList = @(
    "GPU\yolo",
    "GPU\ocr",
    "services\correlation",
    "services\frame_extractor",
    "services\sync_engine",
    "services\report_generator"
)
$envList = @(
    "backend\.env",
    "GPU\yolo\.env",
    "GPU\ocr\.env",
    "services\frame_extractor\.env",
    "services\sync_engine\.env",
    "services\correlation\.env",
    "services\report_generator\.env",
    "frontend\.env"
)

$modelsDir  = Join-Path $root "GPU\yolo\models"
$bestPtPath = Join-Path $modelsDir "best.pt"
$detPtPath  = Join-Path $modelsDir "train_num_detector.pt"

# Scan venvs
$venvResults = @{}
foreach ($svc in $svcList) {
    if ($Clean) {
        $venvResults[$svc] = @{ Status = $BROKEN; Detail = "clean rebuild forced" }
    } else {
        $venvResults[$svc] = Test-Venv (Join-Path $root $svc)
    }
}

# Scan npm + prisma
$backendNpm   = Test-NpmInstall (Join-Path $root "backend")  "fastify"
$frontendNpm  = Test-NpmInstall (Join-Path $root "frontend") "react"
$prismaStatus = Test-PrismaClient

# Scan models
$bestPtStatus = Test-ModelFile $bestPtPath 1.0
$detPtStatus  = Test-ModelFile $detPtPath  0.5

# Scan envs
$envResults = @{}
foreach ($env in $envList) { $envResults[$env] = Test-EnvFile $env }

# ================================================================================
#  PHASE 3 -- PRINT STATUS TABLE
# ================================================================================
Print-Section "SYSTEM REQUIREMENTS"
Print-Row $OK   "Python"  "$pyVer  ($PY)"
Print-Row $OK   "Node.js" "$nodeVer   npm $npmVer"
if ($HasGPU) { Print-Row $INFO "GPU" "NVIDIA detected -- CUDA builds will be used" }
else         { Print-Row $INFO "GPU" "Not detected -- CPU builds will be used" }

Print-Section "PYTHON SERVICE ENVIRONMENTS"
foreach ($svc in $svcList) {
    $r = $venvResults[$svc]
    Print-Row $r.Status $svc $r.Detail
}

Print-Section "NODE.JS PACKAGES"
$bDetail = if ($backendNpm  -eq $OK) { "present" } else { "missing -- will install" }
$fDetail = if ($frontendNpm -eq $OK) { "present" } else { "missing -- will install" }
$pDetail = if ($prismaStatus -eq $OK) { "generated" } else { "not generated -- will fix" }
Print-Row $backendNpm   "backend  node_modules"  $bDetail
Print-Row $frontendNpm  "frontend node_modules"  $fDetail
Print-Row $prismaStatus "Prisma client"           $pDetail

Print-Section "MODEL WEIGHTS"
Print-Row $bestPtStatus.Status "best.pt"               $bestPtStatus.Detail
Print-Row $detPtStatus.Status  "train_num_detector.pt" $detPtStatus.Detail

Print-Section "ENVIRONMENT FILES (.env)"
foreach ($env in $envList) {
    $s = $envResults[$env]
    $d = if ($s -eq $OK) { "" } else { "missing -- will create" }
    Print-Row $s $env $d
}

# Count broken items
$brokenCount = 0
foreach ($svc in $svcList) { if ($venvResults[$svc].Status -ne $OK) { $brokenCount++ } }
if ($backendNpm   -ne $OK) { $brokenCount++ }
if ($frontendNpm  -ne $OK) { $brokenCount++ }
if ($prismaStatus -ne $OK) { $brokenCount++ }
if ($bestPtStatus.Status -ne $OK) { $brokenCount++ }
if ($detPtStatus.Status  -ne $OK) { $brokenCount++ }
foreach ($env in $envList) { if ($envResults[$env] -ne $OK) { $brokenCount++ } }

Write-Host ""
if ($brokenCount -eq 0) {
    Write-Host "  +========================================================+" -ForegroundColor Green
    Write-Host "   All components are healthy -- nothing to fix." -ForegroundColor Green
    Write-Host "  +========================================================+" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Run  run.bat  to start all services." -ForegroundColor Cyan
    Write-Host ""
    Read-Host "  Press Enter to close"
    exit 0
}

Write-Host "  +========================================================+" -ForegroundColor Yellow
Write-Host "   $brokenCount item(s) need attention -- fixing now..." -ForegroundColor Yellow
Write-Host "  +========================================================+" -ForegroundColor Yellow

# ================================================================================
#  PHASE 4 -- FIX BROKEN COMPONENTS  (in dependency order)
# ================================================================================

# Step A: .env files first (services need them to start)
Print-Section "FIXING: Environment files"
foreach ($env in $envList) {
    if ($envResults[$env] -ne $OK) {
        $content = Get-EnvContent $env $HasGPU
        Repair-EnvFile $env $content
    } else {
        Print-Info "OK (skip): $env"
    }
}

# Step B: Python venvs
Print-Section "FIXING: Python service environments"
foreach ($svc in $svcList) {
    if ($venvResults[$svc].Status -ne $OK) {
        Repair-Venv $svc $PY $HasGPU | Out-Null
    } else {
        Print-Info "OK (skip): $svc"
    }
}

# Step C: npm installs
Print-Section "FIXING: Node.js packages"
if ($backendNpm -ne $OK) {
    Repair-Npm "backend" | Out-Null
} else {
    Print-Info "OK (skip): backend node_modules"
}
if ($frontendNpm -ne $OK) {
    Repair-Npm "frontend" | Out-Null
} else {
    Print-Info "OK (skip): frontend node_modules"
}

# Step D: Prisma client (needs backend node_modules)
Print-Section "FIXING: Prisma DB client"
if ($prismaStatus -ne $OK -or $backendNpm -ne $OK) {
    Repair-Prisma | Out-Null
} else {
    Print-Info "OK (skip): Prisma client already generated"
}

# Step E: Model weights
Print-Section "FIXING: YOLO model weights"
if (-not (Test-Path $modelsDir)) { New-Item -ItemType Directory -Force $modelsDir | Out-Null }
if ($bestPtStatus.Status -ne $OK) {
    Repair-ModelFile $BEST_PT_GDRIVE_ID $bestPtPath "best.pt" 1.0 | Out-Null
} else {
    Print-Info "OK (skip): best.pt already present"
}
if ($detPtStatus.Status -ne $OK) {
    Repair-ModelFile $DETECTOR_PT_GDRIVE_ID $detPtPath "train_num_detector.pt" 0.5 | Out-Null
} else {
    Print-Info "OK (skip): train_num_detector.pt already present"
}

# ================================================================================
#  PHASE 5 -- FINAL SUMMARY
# ================================================================================
Write-Host ""
Write-Host "  +========================================================+" -ForegroundColor Cyan
Write-Host "   FINAL SUMMARY" -ForegroundColor Cyan
Write-Host "  +========================================================+" -ForegroundColor Cyan

if ($fixedItems.Count -gt 0) {
    Write-Host ""
    Write-Host "  Fixed:" -ForegroundColor Green
    foreach ($item in $fixedItems) { Write-Host "    [OK]  $item" -ForegroundColor Green }
}

if ($failedItems.Count -gt 0) {
    Write-Host ""
    Write-Host "  Still broken (manual action needed):" -ForegroundColor Red
    foreach ($item in $failedItems) { Write-Host "    [!!]  $item" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Fix the issues above and run setup.bat again." -ForegroundColor DarkYellow
} else {
    $gpuMode = if ($HasGPU) { "GPU / CUDA" } else { "CPU only" }
    Write-Host ""
    Write-Host "  All components ready!  ($gpuMode)" -ForegroundColor Green
    Write-Host ""
    Write-Host "  +--------------------------------------------------+" -ForegroundColor Green
    Write-Host "  |  Run  run.bat  to start RDSO_MVIS                |" -ForegroundColor Green
    Write-Host "  +--------------------------------------------------+" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Service URLs once running:" -ForegroundColor Gray
    Write-Host "    Frontend  ->  http://localhost:5173" -ForegroundColor Gray
    Write-Host "    Backend   ->  http://localhost:8001" -ForegroundColor Gray
    Write-Host "    YOLO      ->  http://localhost:5002/health" -ForegroundColor Gray
    Write-Host "    OCR       ->  http://localhost:5000/health" -ForegroundColor Gray
}
Write-Host ""
