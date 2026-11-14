@echo off
REM SkillForge AI - one-click setup and run for Windows
cd /d "%~dp0backend"

where python >nul 2>nul
if errorlevel 1 (
  echo Python is not installed. Install Python 3.10+ from https://www.python.org/downloads/
  echo IMPORTANT: tick "Add python.exe to PATH" during installation, then run this file again.
  pause
  exit /b 1
)

if not exist .venv (
  echo Creating virtual environment...
  python -m venv .venv
)
call .venv\Scripts\activate.bat

echo Installing / checking packages (first run takes a minute)...
python -m pip install --upgrade pip >nul
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo Package install failed - starting the zero-install server instead.
  start "" http://localhost:8000
  python devserver.py
  exit /b
)

echo.
echo Starting SkillForge AI on http://localhost:8000  (press Ctrl+C to stop)
start "" http://localhost:8000
python -m uvicorn main:app --port 8000
