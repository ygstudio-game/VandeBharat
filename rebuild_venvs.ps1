# Rebuild all service venvs against Python 3.13 (E:\Python) after the 3.10 -> 3.13 migration.
# Run from the Main/ directory:  powershell -ExecutionPolicy Bypass -File .\rebuild_venvs.ps1

$ErrorActionPreference = "Stop"
$PY = "E:\Python\python.exe"

if (-not (Test-Path $PY)) { throw "Python not found at $PY" }
Write-Host "Using base interpreter: $PY" -ForegroundColor Cyan
& $PY --version

$services = @(
    "GPU\yolo",
    "GPU\ocr",
    "services\correlation",
    "services\frame_extractor",
    "services\sync_engine",
    "services\report_generator"
)

$root = $PSScriptRoot

foreach ($svc in $services) {
    $dir = Join-Path $root $svc
    Write-Host "`n=== $svc ===" -ForegroundColor Yellow
    Push-Location $dir

    if (Test-Path "venv") { Remove-Item -Recurse -Force "venv" }
    & $PY -m venv venv
    $venvPy = ".\venv\Scripts\python.exe"

    & $venvPy -m pip install --upgrade pip
    & $venvPy -m pip install -r requirements.txt

    # YOLO needs PyTorch from the CUDA wheel index (cp313)
    if ($svc -eq "GPU\yolo") {
        & $venvPy -m pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
    }

    # OCR optional GPU acceleration (skip if no CUDA — RapidOCR falls back to CPU)
    if ($svc -eq "GPU\ocr") {
        & $venvPy -m pip install onnxruntime-gpu==1.20.1
    }

    Pop-Location
    Write-Host "=== $svc done ===" -ForegroundColor Green
}

Write-Host "`nAll venvs rebuilt. Now run: npm run start" -ForegroundColor Cyan
