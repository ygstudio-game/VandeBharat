@echo off
REM ============================================================
REM  RDSO_MVIS -- Update
REM  Pulls the latest code from GitHub, then force-installs the
REM  latest dependencies in every Python venv, the backend, and
REM  the frontend. Waits for a keypress before closing so the
REM  output can always be reviewed.
REM
REM  Usage:  update.bat
REM ============================================================
setlocal
title RDSO_MVIS -- Update

set "ROOT=%~dp0"
set "FAILED=0"

echo.
echo  +========================================================+
echo  ^|   RDSO_MVIS  --  Update                                ^|
echo  +========================================================+
echo.

REM ── Step 1: Git pull ─────────────────────────────────────────
echo  [1/4] Pulling latest code from GitHub...
echo.

git -C "%ROOT%." pull
set "GIT_RC=%ERRORLEVEL%"

if "%GIT_RC%"=="0" (
    echo.
    echo  [OK] Code updated successfully.
) else (
    echo.
    echo  [WARN] git pull returned an error ^(code %GIT_RC%^).
    echo  This may mean there are local changes conflicting with remote,
    echo  or there is no internet connection.
    echo.
    set /p CONT="  Continue installing dependencies anyway? [Y/N]: "
    if /I not "%CONT%"=="Y" (
        echo  Cancelled.
        goto :end
    )
)

REM ── Step 2: Python venv dependencies ─────────────────────────
echo.
echo  [2/4] Installing Python dependencies in every venv...
echo.

call :update_venv "GPU\ocr"
call :update_venv "GPU\yolo"
call :update_venv "services\correlation"
call :update_venv "services\frame_extractor"
call :update_venv "services\report_generator"
call :update_venv "services\sync_engine"

REM ── Step 3: Backend (Node.js) dependencies ───────────────────
echo.
echo  [3/4] Installing backend dependencies...
echo.

if exist "%ROOT%backend\package.json" (
    pushd "%ROOT%backend"
    call npm install
    if errorlevel 1 (
        echo  [ERROR] backend npm install failed.
        set "FAILED=1"
    ) else (
        echo  [OK] backend dependencies installed.
        echo.
        echo  Applying any Prisma schema changes...
        call npx prisma generate
        if errorlevel 1 (
            echo  [ERROR] prisma generate failed.
            set "FAILED=1"
        )
    )
    popd
) else (
    echo  [WARN] backend\package.json not found -- skipped.
)

REM ── Step 4: Frontend (Node.js) dependencies ──────────────────
echo.
echo  [4/4] Installing frontend dependencies...
echo.

if exist "%ROOT%frontend\package.json" (
    pushd "%ROOT%frontend"
    call npm install
    if errorlevel 1 (
        echo  [ERROR] frontend npm install failed.
        set "FAILED=1"
    ) else (
        echo  [OK] frontend dependencies installed.
    )
    popd
) else (
    echo  [WARN] frontend\package.json not found -- skipped.
)

goto :end

REM ── Helper: pip-install requirements.txt into one service's venv ──
:update_venv
set "SVC_DIR=%ROOT%%~1"
set "VENV_PY=%SVC_DIR%\venv\Scripts\python.exe"
set "REQ_FILE=%SVC_DIR%\requirements.txt"

if not exist "%VENV_PY%" (
    echo  [WARN] %~1 -- venv not found. Run setup.bat first to create it. Skipped.
    goto :eof
)
if not exist "%REQ_FILE%" (
    echo  [WARN] %~1 -- requirements.txt not found. Skipped.
    goto :eof
)

echo  Installing %~1 dependencies...
"%VENV_PY%" -m pip install -r "%REQ_FILE%" --quiet --prefer-binary --no-cache-dir
if errorlevel 1 (
    echo  [ERROR] %~1 -- pip install failed.
    set "FAILED=1"
) else (
    echo  [OK] %~1 dependencies up to date.
)
goto :eof

:end
echo.
echo  +========================================================+
if "%FAILED%"=="1" (
    echo  ^|   UPDATE FINISHED WITH ERRORS -- see messages above   ^|
) else (
    echo  ^|   UPDATE COMPLETE                                     ^|
)
echo  +========================================================+
echo.
pause
endlocal & exit /b %FAILED%
