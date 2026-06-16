@echo off
REM ============================================================
REM  RDSO_MVIS -- Update & Setup
REM  Pulls the latest code from GitHub, then runs setup to fix
REM  any new dependencies or config changes.
REM
REM  Usage:  update.bat
REM ============================================================
title RDSO_MVIS -- Update

echo.
echo  +========================================================+
echo  |   RDSO_MVIS  --  Update ^& Setup                       |
echo  +========================================================+
echo.

REM ── Step 1: Git pull ─────────────────────────────────────────
echo  [1/2] Pulling latest code from GitHub...
echo.

git -C "%~dp0" pull
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
    set /p CONT="  Continue to setup anyway? [Y/N]: "
    if /I not "%CONT%"=="Y" (
        echo  Cancelled.
        pause
        exit /b 1
    )
)

echo.
echo  [2/2] Running setup to apply any new dependencies...
echo.

REM ── Step 2: Run setup ────────────────────────────────────────
call "%~dp0setup.bat"
set "SETUP_RC=%ERRORLEVEL%"

if not "%SETUP_RC%"=="0" (
    echo.
    echo  [ERROR] Setup reported failures. Check the output above.
    pause
    exit /b %SETUP_RC%
)

exit /b 0
