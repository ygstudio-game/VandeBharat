@echo off
REM ============================================================
REM  RDSO_MVIS  —  Launch all services
REM  Machine Vision-based Inspection System
REM
REM  Prerequisites:  run setup.bat once first
REM  Usage:          double-click this file, or:  run.bat
REM ============================================================
title RDSO_MVIS — Startup

echo.
echo   =================================================
echo     RDSO_MVIS  —  Machine Vision Inspection System
echo     Starting all services...
echo   =================================================
echo.

REM ── Pre-flight checks ────────────────────────────────────────
set "ROOT=%~dp0"
set "FAIL=0"

if not exist "%ROOT%backend\node_modules\" (
    echo   [FAIL] backend\node_modules is missing.
    set "FAIL=1"
)
if not exist "%ROOT%frontend\node_modules\" (
    echo   [FAIL] frontend\node_modules is missing.
    set "FAIL=1"
)
if not exist "%ROOT%GPU\yolo\venv\" (
    echo   [FAIL] GPU\yolo\venv is missing.
    set "FAIL=1"
)
if not exist "%ROOT%GPU\ocr\venv\" (
    echo   [FAIL] GPU\ocr\venv is missing.
    set "FAIL=1"
)
if not exist "%ROOT%services\frame_extractor\venv\" (
    echo   [FAIL] services\frame_extractor\venv is missing.
    set "FAIL=1"
)
if not exist "%ROOT%services\sync_engine\venv\" (
    echo   [FAIL] services\sync_engine\venv is missing.
    set "FAIL=1"
)
if not exist "%ROOT%services\correlation\venv\" (
    echo   [FAIL] services\correlation\venv is missing.
    set "FAIL=1"
)
if not exist "%ROOT%services\report_generator\venv\" (
    echo   [FAIL] services\report_generator\venv is missing.
    set "FAIL=1"
)
if not exist "%ROOT%backend\.env" (
    echo   [FAIL] backend\.env is missing.
    set "FAIL=1"
)

if "%FAIL%"=="1" (
    echo.
    echo   One or more required components are missing.
    echo   Run setup.bat first, then try again.
    echo.
    pause
    exit /b 1
)

REM ── YOLO model warning (non-fatal) ───────────────────────────
if not exist "%ROOT%GPU\yolo\models\best.pt" (
    echo   [WARN] GPU\yolo\models\best.pt not found.
    echo   [WARN] YOLO service will fail on startup.
    echo   [WARN] Place the model files and restart.
    echo.
)

REM ── Launch ───────────────────────────────────────────────────
echo   All checks passed. Launching services...
echo.
echo   Frontend  ->  http://localhost:5173
echo   Backend   ->  http://localhost:8001
echo.
echo   Press Ctrl+C to stop everything.
echo.

node "%ROOT%start.js"

REM ── If start.js exits with an error, keep the window open ────
if errorlevel 1 (
    echo.
    echo   [ERROR] One or more services failed to start.
    echo   Check the output above for details.
    echo.
    pause
)
