@echo off
REM ============================================================
REM  RDSO_MVIS - One-shot setup launcher
REM  Machine Vision-based Inspection System
REM  Forwards to setup.ps1 (the real installer).
REM
REM  Usage:
REM     setup.bat            reuse existing venvs (fast)
REM     setup.bat --clean    rebuild all venvs from scratch
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
    echo [SETUP FAILED] Fix the error above and re-run setup.bat
)

endlocal & exit /b %RC%
