<#
  RDSO_MVIS — One-shot Setup
  Machine Vision-based Inspection System
  ----------------------------------------
  Usage:
      setup.bat              reuse existing venvs (fast re-run)
      setup.bat --clean      rebuild all venvs from scratch

  Or run directly:
      powershell -ExecutionPolicy Bypass -File .\setup.ps1
      powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Clean

  What this does:
    1. Find Python 3.13+ (PATH / py launcher / common install dirs)
    2. Verify Node.js 18+
    3. Detect NVIDIA GPU (falls back to CPU builds)
    4. Create / reuse 6 Python service venvs and install requirements
    5. npm install for backend and frontend
    6. Generate Prisma DB client (npx prisma generate)
    7. Download YOLO model weights from Google Drive (or unpack local models.zip)
    8. Write all 8 .env files with baked-in credentials
#>

param([switch]$Clean)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# ════════════════════════════════════════════════════════════════════════════════
#  BAKED-IN CREDENTIALS  (shared Neon DB + Cloudinary)
#  These are the same for all developers — no prompting needed.
# ════════════════════════════════════════════════════════════════════════════════
$DB_URL     = 'postgresql://neondb_owner:npg_l5N8rTFfYvtU@ep-soft-sea-aog27v8w-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
$CLOUD_NAME = 'dpekqbt25'
$CLOUD_KEY  = '188155567875174'
$CLOUD_SEC  = 'cbAG3rHterwXs1UTRwO2-vpM9ls'

# ════════════════════════════════════════════════════════════════════════════════
#  GOOGLE DRIVE MODEL WEIGHTS
#  Both .pt files are hosted as individual files on Google Drive.
# ════════════════════════════════════════════════════════════════════════════════
$BEST_PT_GDRIVE_ID     = "1GyXpDMTBjqWgxtSxvKywVixU41nlpqaQ"   # best.pt  (defect detector)
$DETECTOR_PT_GDRIVE_ID = "1YXRolLSe_q2ouz13ndFuF_g-WKVCUYk0"   # train_num_detector.pt

# ════════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ════════════════════════════════════════════════════════════════════════════════
function Section($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Yellow }
function Info($msg)    { Write-Host "    $msg" -ForegroundColor Gray }
function Ok($msg)      { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Warn($msg)    { Write-Host "  [!!] $msg" -ForegroundColor DarkYellow }

function Assert-LastExit($what) {
    if ($LASTEXITCODE -ne 0) { throw "FAILED: $what (exit $LASTEXITCODE)" }
}

# Find Python 3.13+ across all common Windows locations
function Resolve-Python313 {
    # 1. Python Launcher for Windows (py -3.13) — most reliable
    if (Get-Command py -ErrorAction SilentlyContinue) {
        try {
            $v = & py -3.13 --version 2>&1
            if ($LASTEXITCODE -eq 0 -and "$v" -match "3\.(1[3-9]|\d{2,})") {
                $exe = (& py -3.13 -c "import sys; print(sys.executable)" 2>&1).Trim()
                if (Test-Path $exe) { return @{ Path = $exe; Version = "$v".Trim() } }
            }
        } catch {}
    }

    # 2. 'python' already on PATH and is 3.13+
    $pyOnPath = Get-Command python -ErrorAction SilentlyContinue
    if ($pyOnPath) {
        $v = & python --version 2>&1
        if ("$v" -match "3\.(1[3-9]|\d{2,})") {
            return @{ Path = $pyOnPath.Source; Version = "$v".Trim() }
        }
    }

    # 3. 'python3' on PATH
    $py3OnPath = Get-Command python3 -ErrorAction SilentlyContinue
    if ($py3OnPath) {
        $v = & python3 --version 2>&1
        if ("$v" -match "3\.(1[3-9]|\d{2,})") {
            return @{ Path = $py3OnPath.Source; Version = "$v".Trim() }
        }
    }

    # 4. Scan well-known install paths
    $guesses = @(
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python314\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python315\python.exe",
        "C:\Python313\python.exe",
        "C:\Python314\python.exe",
        "C:\Program Files\Python313\python.exe",
        "C:\Program Files\Python314\python.exe"
    )
    foreach ($p in $guesses) {
        if (Test-Path $p) {
            $v = & $p --version 2>&1
            if ("$v" -match "3\.(1[3-9]|\d{2,})") {
                return @{ Path = $p; Version = "$v".Trim() }
            }
        }
    }

    throw @"

  Python 3.13+ not found.

  Install it from: https://www.python.org/downloads/
  During install: tick "Add Python to PATH" and "Install for all users".

  Then re-run:  setup.bat

"@
}

# Download a public Google Drive file (handles large-file confirmation)
function Get-GDriveFile($FileId, $Destination, $Label) {
    Info "Downloading $Label from Google Drive..."
    try {
        $url = "https://drive.usercontent.google.com/download?id=$FileId&export=download&confirm=t"
        $wc  = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        $wc.DownloadFile($url, $Destination)
        if ((Test-Path $Destination) -and (Get-Item $Destination).Length -gt 10240) {
            Ok "Downloaded $Label  ($([math]::Round((Get-Item $Destination).Length / 1MB, 1)) MB)"
            return $true
        }
        Warn "Download produced an unexpectedly small file — check the Drive share settings."
        return $false
    } catch {
        Warn "Download failed: $($_.Exception.Message)"
        return $false
    }
}

# UTF-8 without BOM writer (Python + Node both prefer this)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-Env($rel, $content) {
    $full = Join-Path $root $rel
    if (Test-Path $full) {
        Info "Skipped (already exists): $rel"
        return
    }
    [System.IO.File]::WriteAllText($full, $content, $utf8NoBom)
    Ok "Created: $rel"
}

# ════════════════════════════════════════════════════════════════════════════════
#  BANNER
# ════════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║  RDSO_MVIS  —  One-shot Setup                   ║" -ForegroundColor Cyan
Write-Host "  ║  Machine Vision-based Inspection System          ║" -ForegroundColor Cyan
Write-Host "  ║  Indian Railways / RDSO                          ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ════════════════════════════════════════════════════════════════════════════════
#  1. PREREQUISITES
# ════════════════════════════════════════════════════════════════════════════════
Section "Checking prerequisites"

$py = Resolve-Python313
$PY = $py.Path
Ok "Python : $($py.Version)"
Info "        $PY"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw @"

  Node.js not found.
  Install Node.js 18+ from: https://nodejs.org/en/download
  Then re-run: setup.bat

"@
}
$nodeVer = node --version 2>&1
$npmVer  = npm  --version 2>&1
# Require Node 18+
if ($nodeVer -match "v(\d+)" -and [int]$Matches[1] -lt 18) {
    throw "Node.js 18+ required (found $nodeVer). Download from nodejs.org."
}
Ok "Node.js: $nodeVer   npm: $npmVer"

# ════════════════════════════════════════════════════════════════════════════════
#  2. GPU DETECTION
# ════════════════════════════════════════════════════════════════════════════════
Section "Detecting GPU"
$HasGPU = $false
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    try { & nvidia-smi | Out-Null; if ($LASTEXITCODE -eq 0) { $HasGPU = $true } } catch {}
}
if ($HasGPU) {
    Ok "NVIDIA GPU detected — will install CUDA (cu124) builds of PyTorch / onnxruntime."
} else {
    Warn "No NVIDIA GPU detected — installing CPU builds. Inference will be slower."
}

$YOLO_DEVICE = if ($HasGPU) { "cuda:0" } else { "cpu" }
$OCR_DEVICE  = if ($HasGPU) { "gpu"    } else { "cpu" }

# ════════════════════════════════════════════════════════════════════════════════
#  3. PYTHON SERVICE VENVS  (one per service)
# ════════════════════════════════════════════════════════════════════════════════
$services = @(
    "GPU\yolo",
    "GPU\ocr",
    "services\correlation",
    "services\frame_extractor",
    "services\sync_engine",
    "services\report_generator"
)

foreach ($svc in $services) {
    Section "Python venv — $svc"
    $dir = Join-Path $root $svc
    Push-Location $dir
    try {
        if ($Clean -and (Test-Path "venv")) {
            Info "Clean flag set — removing existing venv..."
            Remove-Item -Recurse -Force "venv"
        }

        if (-not (Test-Path "venv")) {
            Info "Creating venv with Python 3.13..."
            & $PY -m venv venv; Assert-LastExit "venv create ($svc)"
        } else {
            Info "Reusing existing venv  (pass -Clean to rebuild from scratch)."
        }

        $venvPy = ".\venv\Scripts\python.exe"

        Info "Upgrading pip..."
        & $venvPy -m pip install --upgrade pip --quiet; Assert-LastExit "pip upgrade ($svc)"

        Info "Installing requirements.txt..."
        & $venvPy -m pip install -r requirements.txt --quiet; Assert-LastExit "requirements ($svc)"

        # PyTorch — only for YOLO (model inference)
        if ($svc -eq "GPU\yolo") {
            if ($HasGPU) {
                Info "Installing PyTorch 2.6.0 + torchvision (CUDA cu124)..."
                & $venvPy -m pip install torch==2.6.0 torchvision==0.21.0 `
                    --index-url https://download.pytorch.org/whl/cu124 --quiet
            } else {
                Info "Installing PyTorch 2.6.0 + torchvision (CPU)..."
                & $venvPy -m pip install torch==2.6.0 torchvision==0.21.0 --quiet
            }
            Assert-LastExit "torch install"
        }

        # onnxruntime-gpu — only for OCR on GPU machines
        if ($svc -eq "GPU\ocr" -and $HasGPU) {
            Info "Installing onnxruntime-gpu 1.20.1..."
            & $venvPy -m pip install onnxruntime-gpu==1.20.1 --quiet
            Assert-LastExit "onnxruntime-gpu"
        }

        Ok "$svc ready."
    } finally {
        Pop-Location
    }
}

# ════════════════════════════════════════════════════════════════════════════════
#  4. NODE INSTALLS
# ════════════════════════════════════════════════════════════════════════════════
foreach ($pkg in @("backend", "frontend")) {
    Section "npm install — $pkg"
    Push-Location (Join-Path $root $pkg)
    try {
        & npm install --prefer-offline 2>&1 | Where-Object { $_ -notmatch "^npm warn" } | Write-Host -ForegroundColor Gray
        Assert-LastExit "npm install ($pkg)"
        Ok "$pkg dependencies installed."
    } finally {
        Pop-Location
    }
}

# ════════════════════════════════════════════════════════════════════════════════
#  5. PRISMA — Generate DB client
#     (The Neon database schema already exists; this only generates the JS client
#      so the backend server can import @prisma/client without errors.)
# ════════════════════════════════════════════════════════════════════════════════
Section "Prisma DB client"
Push-Location (Join-Path $root "backend")
try {
    Info "Running: npx prisma generate..."
    & npx prisma generate 2>&1 | Write-Host -ForegroundColor Gray
    Assert-LastExit "prisma generate"
    Ok "Prisma client generated."
} finally {
    Pop-Location
}

# ════════════════════════════════════════════════════════════════════════════════
#  6. YOLO MODEL WEIGHTS
# ════════════════════════════════════════════════════════════════════════════════
Section "YOLO model weights"
$modelsDir = Join-Path $root "GPU\yolo\models"
if (-not (Test-Path $modelsDir)) { New-Item -ItemType Directory -Force $modelsDir | Out-Null }

$bestPt = Join-Path $modelsDir "best.pt"
$detPt  = Join-Path $modelsDir "train_num_detector.pt"

if ((Test-Path $bestPt) -and (Test-Path $detPt)) {
    Ok "Model weights already present — skipping download."
} else {
    # Download each .pt file individually from Google Drive
    if (-not (Test-Path $bestPt)) {
        Get-GDriveFile $BEST_PT_GDRIVE_ID $bestPt "best.pt (defect detector)" | Out-Null
    } else {
        Info "best.pt already present."
    }

    if (-not (Test-Path $detPt)) {
        Get-GDriveFile $DETECTOR_PT_GDRIVE_ID $detPt "train_num_detector.pt (number plate)" | Out-Null
    } else {
        Info "train_num_detector.pt already present."
    }

    # Final check
    $missingBest = -not (Test-Path $bestPt)
    $missingDet  = -not (Test-Path $detPt)
    if ($missingBest -or $missingDet) {
        if ($missingBest) { Warn "Still missing: GPU\yolo\models\best.pt" }
        if ($missingDet)  { Warn "Still missing: GPU\yolo\models\train_num_detector.pt" }
        Warn "The YOLO service will fail to start. Place the files manually and retry."
    } else {
        Ok "All model weights in place."
    }
}

# ════════════════════════════════════════════════════════════════════════════════
#  7. ENVIRONMENT FILES  (.env)
#     All credentials are baked in above — no user prompting required.
#     Files are created only if they don't already exist.
# ════════════════════════════════════════════════════════════════════════════════
Section "Environment files (.env)"

# ── backend/.env ─────────────────────────────────────────────────────────────
Write-Env "backend\.env" @"
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

# ── GPU/yolo/.env ─────────────────────────────────────────────────────────────
Write-Env "GPU\yolo\.env" @"
YOLO_MODEL_PATH=models/best.pt
YOLO_OCR_MODEL_PATH=models/train_num_detector.pt

YOLO_DEVICE=$YOLO_DEVICE
YOLO_CONF=0.35
"@

# ── GPU/ocr/.env ──────────────────────────────────────────────────────────────
Write-Env "GPU\ocr\.env" @"
DATABASE_URL="$DB_URL"

YOLO_SERVICE_URL=http://localhost:5002/api/yolo/predict_train_number

OCR_DEVICE=$OCR_DEVICE
"@

# ── services/frame_extractor/.env ─────────────────────────────────────────────
Write-Env "services\frame_extractor\.env" @"
DATABASE_URL="$DB_URL"

CLOUDINARY_CLOUD_NAME=$CLOUD_NAME
CLOUDINARY_API_KEY=$CLOUD_KEY
CLOUDINARY_API_SECRET=$CLOUD_SEC
"@

# ── services/sync_engine/.env ─────────────────────────────────────────────────
Write-Env "services\sync_engine\.env" @"
DATABASE_URL="$DB_URL"
"@

# ── services/correlation/.env ─────────────────────────────────────────────────
Write-Env "services\correlation\.env" @"
DATABASE_URL="$DB_URL"

YOLO_SERVICE_URL=http://localhost:5002/api/yolo/predict

CORRELATION_SAMPLE_N=3
"@

# ── services/report_generator/.env ────────────────────────────────────────────
Write-Env "services\report_generator\.env" @"
DATABASE_URL="$DB_URL"

CLOUDINARY_CLOUD_NAME=$CLOUD_NAME
CLOUDINARY_API_KEY=$CLOUD_KEY
CLOUDINARY_API_SECRET=$CLOUD_SEC
"@

# ── frontend/.env ─────────────────────────────────────────────────────────────
Write-Env "frontend\.env" @"
VITE_API_BASE_URL=http://localhost:8001
"@

# ════════════════════════════════════════════════════════════════════════════════
#  DONE
# ════════════════════════════════════════════════════════════════════════════════
$modeTag = if ($HasGPU) { "GPU mode (CUDA cu124)" } else { "CPU mode" }
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║  Setup complete!  ($modeTag)" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "    1. Place YOLO weights in GPU\yolo\models\  (if not downloaded automatically)" -ForegroundColor Cyan
Write-Host "    2. Double-click  run.bat  to start all services" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Service URLs once running:" -ForegroundColor Gray
Write-Host "    Frontend   ->  http://localhost:5173" -ForegroundColor Gray
Write-Host "    Backend    ->  http://localhost:8001" -ForegroundColor Gray
Write-Host "    YOLO       ->  http://localhost:5002/health" -ForegroundColor Gray
Write-Host "    OCR        ->  http://localhost:5000/health" -ForegroundColor Gray
Write-Host ""
