@echo off
setlocal EnableDelayedExpansion

echo.
echo ================================================
echo   VandeInspect AI  --  One-time Setup
echo ================================================
echo.

REM ── Prereq checks ──────────────────────────────────────────────────────
where python >nul 2>&1 || (
    echo [ERROR] python not found in PATH.
    echo         Install Python 3.10+ from python.org and retry.
    goto :END_FAIL
)
where node >nul 2>&1 || (
    echo [ERROR] node not found in PATH.
    echo         Install Node.js 18+ from nodejs.org and retry.
    goto :END_FAIL
)

echo [CHECK] python and node found. Proceeding...
echo.

goto :MAIN

REM ─────────────────────────────────────────────────────────────────────────
REM  Subroutine: setup_venv <dir> <label>
REM ─────────────────────────────────────────────────────────────────────────
:setup_venv
    set "SVC_DIR=%~1"
    set "SVC_LABEL=%~2"
    echo.
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

REM ─────────────────────────────────────────────────────────────────────────
:MAIN

call :setup_venv "GPU\yolo"                    "YOLO-GPU"
if errorlevel 1 goto :END_FAIL

call :setup_venv "GPU\ocr"                     "OCR-GPU"
if errorlevel 1 goto :END_FAIL

call :setup_venv "services\frame_extractor"    "FRAME-EXTRACTOR"
if errorlevel 1 goto :END_FAIL

call :setup_venv "services\sync_engine"        "SYNC-ENGINE"
if errorlevel 1 goto :END_FAIL

call :setup_venv "services\correlation"        "CORRELATION"
if errorlevel 1 goto :END_FAIL

call :setup_venv "services\report_generator"   "REPORT-GENERATOR"
if errorlevel 1 goto :END_FAIL

echo.
echo [BACKEND] Installing npm dependencies...
pushd backend
call npm install
if errorlevel 1 ( echo [ERROR] npm install failed for backend & popd & goto :END_FAIL )
echo [BACKEND] Done.
popd

echo.
echo [FRONTEND] Installing npm dependencies...
pushd frontend
call npm install
if errorlevel 1 ( echo [ERROR] npm install failed for frontend & popd & goto :END_FAIL )
echo [FRONTEND] Done.
popd

if not exist "GPU\yolo\models" (
    mkdir "GPU\yolo\models"
    echo [YOLO] Created GPU\yolo\models\ directory.
)

echo.
echo ================================================
echo   Base setup complete!
echo ================================================
echo.
echo   NEXT: Install GPU packages manually
echo   (pick the command matching your CUDA version)
echo.
echo   ---------------------------------------------------
echo   YOLO service -- PyTorch GPU
echo   ---------------------------------------------------
echo   cd GPU\yolo
echo.
echo   CUDA 12.1:
echo     venv\Scripts\python.exe -m pip install ^
echo       torch==2.4.0+cu121 torchvision==0.19.0+cu121 ^
echo       --index-url https://download.pytorch.org/whl/cu121
echo.
echo   CUDA 11.8:
echo     venv\Scripts\python.exe -m pip install ^
echo       torch==2.4.0+cu118 torchvision==0.19.0+cu118 ^
echo       --index-url https://download.pytorch.org/whl/cu118
echo.
echo   ---------------------------------------------------
echo   OCR service -- PaddlePaddle GPU
echo   ---------------------------------------------------
echo   cd GPU\ocr
echo.
echo   CUDA 12.0:
echo     venv\Scripts\python.exe -m pip install ^
echo       paddlepaddle-gpu==2.6.1.post120 ^
echo       -i https://www.paddlepaddle.org.cn/packages/stable/cu120/
echo.
echo   CUDA 11.8:
echo     venv\Scripts\python.exe -m pip install ^
echo       paddlepaddle-gpu==2.6.1.post117 ^
echo       -i https://www.paddlepaddle.org.cn/packages/stable/cu117/
echo.
echo   ---------------------------------------------------
echo   YOLO model files  (place in GPU\yolo\models\)
echo   ---------------------------------------------------
echo     best.pt               -- defect detection model
echo     train_num_detector.pt -- bogie ROI model for OCR
echo.
echo   ---------------------------------------------------
echo   .env files to fill in
echo   ---------------------------------------------------
echo     backend\.env                 (DB_URL, CLOUDINARY_*)
echo     services\frame_extractor\.env  (DB_URL, CLOUDINARY_*)
echo     services\report_generator\.env (DB_URL, CLOUDINARY_*)
echo     GPU\yolo\.env                (optional port overrides)
echo     GPU\ocr\.env                 (optional port overrides)
echo.
echo   ---------------------------------------------------
echo   Start everything with:   node start.js
echo   Verify install with:     check.bat
echo   ---------------------------------------------------
echo.
goto :END_OK

:END_FAIL
echo.
echo [SETUP FAILED] Fix the error above and re-run setup.bat
echo.
endlocal
pause
exit /b 1

:END_OK
endlocal
pause
