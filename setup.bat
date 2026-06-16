@echo off
REM ============================================================
REM  RDSO_MVIS — Setup & Health Check
REM  Machine Vision-based Inspection System
REM
REM  Run this to install for the first time, OR any time
REM  something breaks — it scans every component and repairs
REM  only what is missing or broken. Safe to run repeatedly.
REM
REM  Usage:
REM     setup.bat            smart repair (only fixes what's broken)
REM     setup.bat --clean    force-rebuild all Python venvs
REM ============================================================
setlocal

set "PSARGS="
if /I "%~1"=="--clean" set "PSARGS=-Clean"
if /I "%~1"=="-clean"  set "PSARGS=-Clean"
if /I "%~1"=="clean"   set "PSARGS=-Clean"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %PSARGS%
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
    echo.
    echo  [SETUP FAILED] See the errors above.
    echo  Fix any manual items, then run setup.bat again.
    echo.
    pause
)

endlocal & exit /b %RC%
