@echo off
setlocal
title Vision Nexus 2030 - V27 Kingdom Atlas
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node tools\serve.js 8123 --open
  if errorlevel 1 pause
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  python tools\serve.py 8123 --open
  if errorlevel 1 pause
  exit /b
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 tools\serve.py 8123 --open
  if errorlevel 1 pause
  exit /b
)
echo Node.js or Python 3 is needed. Install one, then run this launcher again.
echo Open the folder containing package.json and Launch_Prototype.bat.
pause
exit /b 1
