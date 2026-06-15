<#
  VandeInspect AI - One-shot installer
  -------------------------------------
  Run via setup.bat (double-click or `npm run setup`), or directly:
      powershell -ExecutionPolicy Bypass -File .\setup.ps1
      powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Clean   (force venv rebuild)

  Does, in one go:
    1. Resolve a Python 3.13+ interpreter and verify node/npm
    2. Detect NVIDIA GPU (falls back to CPU builds if absent)
    3. Build the 6 Python service venvs + install requirements (+ torch / onnxruntime)
    4. npm install for backend and frontend
    5. Unpack YOLO model files from models.zip if the .pt files are missing
    6. Prompt once for secrets and write all 8 .env files (skips any that already exist)
#>

param([switch]$Clean)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# ── Helpers ──────────────────────────────────────────────────────────────────
function Section($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Yellow }
function Info($msg)    { Write-Host "    $msg" -ForegroundColor Gray }
function Ok($msg)      { Write-Host "    $msg" -ForegroundColor Green }

# pip / npm / venv are native executables: $ErrorActionPreference does NOT catch
# their non-zero exit codes, so every native call must be followed by this check.
function Assert-LastExit($what) {
    if ($LASTEXITCODE -ne 0) { throw "FAILED: $what (exit code $LASTEXITCODE)" }
}

function Resolve-Python {
    $candidates = @()
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) { $candidates += $cmd.Source }
    $candidates += "E:\Python\python.exe"
    foreach ($p in $candidates) {
        if ($p -and (Test-Path $p)) {
            $v = & $p --version 2>&1
            if ($v -match "3\.(1[3-9]|[2-9][0-9])") { return @{ Path = $p; Version = "$v".Trim() } }
        }
    }
    throw "Python 3.13+ not found. Install it from python.org (or place it at E:\Python) and retry."
}

# ── Banner ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  VandeInspect AI  --  One-shot Setup" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# ── 1. Prerequisites ───────────────────────────────────────────────────────────
Section "Checking prerequisites"
$py = Resolve-Python
$PY = $py.Path
Ok "Python: $($py.Version)  ($PY)"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found in PATH. Install Node.js 18+ from nodejs.org and retry." }
if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { throw "npm not found in PATH. Install Node.js 18+ from nodejs.org and retry." }
Ok "node: $(node --version)   npm: $(npm --version)"

# ── 2. GPU detection ───────────────────────────────────────────────────────────
Section "Detecting GPU"
$HasGPU = $false
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    try { & nvidia-smi | Out-Null; if ($LASTEXITCODE -eq 0) { $HasGPU = $true } } catch { $HasGPU = $false }
}
if ($HasGPU) {
    Ok "NVIDIA GPU detected - installing CUDA (cu124) builds."
} else {
    Info "No NVIDIA GPU detected - installing CPU builds (inference will be slower)."
}

# ── 3. Python service venvs ────────────────────────────────────────────────────
$services = @(
    "GPU\yolo",
    "GPU\ocr",
    "services\correlation",
    "services\frame_extractor",
    "services\sync_engine",
    "services\report_generator"
)

foreach ($svc in $services) {
    Section "Python venv: $svc"
    $dir = Join-Path $root $svc
    Push-Location $dir
    try {
        if ($Clean -and (Test-Path "venv")) {
            Info "Clean: removing existing venv..."
            Remove-Item -Recurse -Force "venv"
        }
        if (-not (Test-Path "venv")) {
            Info "Creating venv..."
            & $PY -m venv venv; Assert-LastExit "venv create ($svc)"
        } else {
            Info "Reusing existing venv (pass -Clean to rebuild)."
        }

        $venvPy = ".\venv\Scripts\python.exe"
        Info "Upgrading pip..."
        & $venvPy -m pip install --upgrade pip; Assert-LastExit "pip upgrade ($svc)"
        Info "Installing requirements.txt..."
        & $venvPy -m pip install -r requirements.txt; Assert-LastExit "requirements ($svc)"

        if ($svc -eq "GPU\yolo") {
            if ($HasGPU) {
                Info "Installing torch 2.6.0 + torchvision 0.21.0 (CUDA cu124)..."
                & $venvPy -m pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
            } else {
                Info "Installing torch 2.6.0 + torchvision 0.21.0 (CPU)..."
                & $venvPy -m pip install torch==2.6.0 torchvision==0.21.0
            }
            Assert-LastExit "torch install ($svc)"
        }

        if ($svc -eq "GPU\ocr" -and $HasGPU) {
            Info "Installing onnxruntime-gpu 1.20.1..."
            & $venvPy -m pip install onnxruntime-gpu==1.20.1; Assert-LastExit "onnxruntime-gpu ($svc)"
        }
        Ok "$svc ready."
    }
    finally { Pop-Location }
}

# ── 4. Node installs ───────────────────────────────────────────────────────────
foreach ($node in @("backend", "frontend")) {
    Section "npm install: $node"
    Push-Location (Join-Path $root $node)
    try { & npm install; Assert-LastExit "npm install ($node)"; Ok "$node ready." }
    finally { Pop-Location }
}

# ── 5. YOLO model files ────────────────────────────────────────────────────────
Section "YOLO model files"
$modelsDir = Join-Path $root "GPU\yolo\models"
if (-not (Test-Path $modelsDir)) { New-Item -ItemType Directory -Force $modelsDir | Out-Null }
$best     = Join-Path $modelsDir "best.pt"
$detector = Join-Path $modelsDir "train_num_detector.pt"
$zip      = Join-Path $root "GPU\yolo\models.zip"

if ((Test-Path $best) -and (Test-Path $detector)) {
    Ok "Model files already present."
} elseif (Test-Path $zip) {
    Info "Model files missing - extracting from models.zip..."
    $tmp = Join-Path $env:TEMP ("vandemodels_" + [guid]::NewGuid().ToString("N"))
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    foreach ($name in @("best.pt", "train_num_detector.pt")) {
        $found = Get-ChildItem -Path $tmp -Recurse -Filter $name -ErrorAction SilentlyContinue | Select-Object -First 1
        $dest  = Join-Path $modelsDir $name
        if ($found -and -not (Test-Path $dest)) { Copy-Item $found.FullName $dest; Info "placed $name" }
    }
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    if ((Test-Path $best) -and (Test-Path $detector)) { Ok "Model files extracted." }
    else { Info "WARNING: some model files still missing - place best.pt and train_num_detector.pt in $modelsDir manually." }
} else {
    Info "WARNING: model files missing and no models.zip found."
    Info "Place best.pt and train_num_detector.pt in $modelsDir before running."
}

# ── 6. .env generation ───────────────────────────────────────────────────────────
Section "Environment files (.env)"

$envTargets = @(
    @{ Path = "backend\.env";                      Kind = "backend"  },
    @{ Path = "GPU\yolo\.env";                     Kind = "db"       },
    @{ Path = "GPU\ocr\.env";                      Kind = "db"       },
    @{ Path = "services\sync_engine\.env";         Kind = "db"       },
    @{ Path = "services\correlation\.env";         Kind = "db"       },
    @{ Path = "services\frame_extractor\.env";     Kind = "dbcloud"  },
    @{ Path = "services\report_generator\.env";    Kind = "dbcloud"  },
    @{ Path = "frontend\.env";                     Kind = "frontend" }
)

$missing = @($envTargets | Where-Object { -not (Test-Path (Join-Path $root $_.Path)) })

if ($missing.Count -eq 0) {
    Ok "All 8 .env files already exist - leaving them untouched."
} else {
    $needDB    = @($missing | Where-Object { $_.Kind -in @("backend","db","dbcloud") }).Count -gt 0
    $needCloud = @($missing | Where-Object { $_.Kind -in @("backend","dbcloud") }).Count -gt 0

    Info "$($missing.Count) .env file(s) need to be created. Enter the values once:"
    $DB = ""; $CN = ""; $CK = ""; $CS = ""
    if ($needDB)    { $DB = Read-Host "  DATABASE_URL (postgres connection string)" }
    if ($needCloud) {
        $CN = Read-Host "  CLOUDINARY_CLOUD_NAME"
        $CK = Read-Host "  CLOUDINARY_API_KEY"
        $CS = Read-Host "  CLOUDINARY_API_SECRET"
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $created = @(); $skipped = @()

    foreach ($t in $envTargets) {
        $full = Join-Path $root $t.Path
        if (Test-Path $full) { $skipped += $t.Path; continue }

        switch ($t.Kind) {
            "backend" {
                $content = @"
DATABASE_URL="$DB"

CLOUDINARY_CLOUD_NAME=$CN
CLOUDINARY_API_KEY=$CK
CLOUDINARY_API_SECRET=$CS

FRONTEND_URL=http://localhost:5173

FRAME_EXTRACTOR_URL=http://localhost:5003
OCR_SERVICE_URL=http://localhost:5000
YOLO_SERVICE_URL=http://localhost:5002
SYNC_ENGINE_URL=http://localhost:5004
CORRELATION_URL=http://localhost:5005
REPORT_GENERATOR_URL=http://localhost:5006

PORT=8001
NODE_ENV=development
"@
            }
            "db" {
                $content = "DATABASE_URL=`"$DB`"`n"
            }
            "dbcloud" {
                $content = @"
DATABASE_URL="$DB"
CLOUDINARY_CLOUD_NAME=$CN
CLOUDINARY_API_KEY=$CK
CLOUDINARY_API_SECRET=$CS
"@
            }
            "frontend" {
                $content = "VITE_API_BASE_URL=http://localhost:8001`n"
            }
        }

        [System.IO.File]::WriteAllText($full, $content, $utf8NoBom)
        $created += $t.Path
    }

    foreach ($c in $created) { Ok "created: $c" }
    foreach ($s in $skipped) { Info "skipped (already exists): $s" }
}

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Setup complete!  ($(if ($HasGPU) {'GPU mode'} else {'CPU mode'}))" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Start everything with:   npm run start" -ForegroundColor Cyan
Write-Host "  Verify install with:     check.bat" -ForegroundColor Cyan
Write-Host ""
