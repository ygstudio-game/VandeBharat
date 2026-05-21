@echo off
setlocal EnableDelayedExpansion

echo.
echo ================================================
echo   VandeInspect AI  ^|  One-time Setup
echo ================================================
echo.

REM ── Prereq checks ──────────────────────────────────────────────────────
where python >nul 2>&1 || (
    echo [ERROR] python not found in PATH.
    echo         Install Python 3.10+ from python.org and retry.
    exit /b 1
)
where node >nul 2>&1 || (
    echo [ERROR] node not found in PATH.
    echo         Install Node.js 18+ from nodejs.org and retry.
    exit /b 1
)

echo [CHECK] python and node found. Proceeding...
echo.

REM ── Jump over subroutine ────────────────────────────────────────────────
goto :MAIN

REM ────────────────────────────────────────────────────────────────────────
REM  :setup_venv <relative_dir> <label>
REM  Creates venv + installs requirements.txt inside that dir.
REM ────────────────────────────────────────────────────────────────────────
:setup_venv
    set "SVC_DIR=%~1"
    set "SVC_LABEL=%~2"
    echo [%SVC_LABEL%] Setting up venv in %SVC_DIR% ...
    pushd "%SVC_DIR%"

    if not exist venv (
        python -m venv venv
        if errorlevel 1 (
            echo [ERROR] venv creation failed for %SVC_LABEL%
            popd & exit /b 1
        )
    ) else (
        echo [%SVC_LABEL%] venv already exists, skipping creation.
    )

    echo [%SVC_LABEL%] Upgrading pip...
    venv\Scripts\python.exe -m pip install --upgrade pip
    echo [%SVC_LABEL%] Installing requirements...
    venv\Scripts\python.exe -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] pip install failed for %SVC_LABEL%
        popd & exit /b 1
    )

    echo [%SVC_LABEL%] Done.
    popd
    exit /b 0

REM ────────────────────────────────────────────────────────────────────────
:MAIN

REM ── Python venvs ─────────────────────────────────────────────────────────
REM  GPU services each get their own isolated venv.
REM  Base packages only — GPU-specific packages (torch, paddlepaddle-gpu)
REM  must be installed manually (see instructions at the end of this script).

call :setup_venv "GPU\yolo"                    "YOLO-GPU"
if errorlevel 1 exit /b 1

call :setup_venv "GPU\ocr"                     "OCR-GPU"
if errorlevel 1 exit /b 1

call :setup_venv "services\frame_extractor"    "FRAME-EXTRACTOR"
if errorlevel 1 exit /b 1

call :setup_venv "services\sync_engine"        "SYNC-ENGINE"
if errorlevel 1 exit /b 1

call :setup_venv "services\correlation"        "CORRELATION"
if errorlevel 1 exit /b 1

call :setup_venv "services\report_generator"   "REPORT-GENERATOR"
if errorlevel 1 exit /b 1

REM ── Node.js: backend ─────────────────────────────────────────────────────
echo.
echo [BACKEND] Installing npm dependencies...
pushd backend
call npm install
if errorlevel 1 ( echo [ERROR] npm install failed for backend & popd & exit /b 1 )
echo [BACKEND] Done.
popd

REM ── Node.js: frontend ────────────────────────────────────────────────────
echo.
echo [FRONTEND] Installing npm dependencies...
pushd frontend
call npm install
if errorlevel 1 ( echo [ERROR] npm install failed for frontend & popd & exit /b 1 )
echo [FRONTEND] Done.
popd

REM ── Create models directory ───────────────────────────────────────────────
if not exist "GPU\yolo\models" (
    mkdir "GPU\yolo\models"
    echo [YOLO] Created GPU\yolo\models\ directory.
)

echo.
echo ================================================
echo   Base setup complete!
echo ================================================
echo.
echo   ┌─────────────────────────────────────────────────────────┐
echo   │  MANUAL STEP 1: Install GPU packages                     │
echo   │  (choose the command matching your CUDA version)         │
echo   │                                                           │
echo   │  YOLO service — PyTorch GPU                               │
echo   │    cd GPU\yolo                                            │
echo   │    CUDA 12.1:                                             │
echo   │    venv\Scripts\pip install torch==2.4.0+cu121 ^         │
echo   │      torchvision==0.19.0+cu121 ^                         │
echo   │      --index-url https://download.pytorch.org/whl/cu121  │
echo   │    CUDA 11.8:                                             │
echo   │    venv\Scripts\pip install torch==2.4.0+cu118 ^         │
echo   │      torchvision==0.19.0+cu118 ^                         │
echo   │      --index-url https://download.pytorch.org/whl/cu118  │
echo   │                                                           │
echo   │  OCR service — PaddlePaddle GPU                           │
echo   │    cd GPU\ocr                                             │
echo   │    CUDA 12.0:                                             │
echo   │    venv\Scripts\pip install paddlepaddle-gpu==2.6.1.post120 ^
echo   │      -i https://www.paddlepaddle.org.cn/packages/stable/cu120/
echo   │    CUDA 11.8:                                             │
echo   │    venv\Scripts\pip install paddlepaddle-gpu==2.6.1.post117 ^
echo   │      -i https://www.paddlepaddle.org.cn/packages/stable/cu117/
echo   └─────────────────────────────────────────────────────────┘
echo.
echo   ┌─────────────────────────────────────────────────────────┐
echo   │  MANUAL STEP 2: Place YOLO model files                   │
echo   │                                                           │
echo   │    GPU\yolo\models\best.pt              (defect model)    │
echo   │    GPU\yolo\models\train_num_detector.pt (OCR ROI model)  │
echo   └─────────────────────────────────────────────────────────┘
echo.
echo   ┌─────────────────────────────────────────────────────────┐
echo   │  MANUAL STEP 3: Fill in .env files                       │
echo   │                                                           │
echo   │    backend\.env                (DB_URL, CLOUDINARY_*)    │
echo   │    services\frame_extractor\.env  (DB_URL, CLOUDINARY_*) │
echo   │    services\report_generator\.env (DB_URL, CLOUDINARY_*) │
echo   │    GPU\yolo\.env               (optional port overrides)  │
echo   │    GPU\ocr\.env                (optional port overrides)  │
echo   └─────────────────────────────────────────────────────────┘
echo.
echo   Then start the whole stack with:
echo     node start.js        (or: npm start)
echo.

endlocal
