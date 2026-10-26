@echo off
setlocal
rem Vision Nexus 2030 — start a local server and open the game (Windows). Works offline.
rem The three.js renderer needs http:// (browsers block ES modules on file:// pages).
cd /d "%~dp0"
set PORT=8123
set URL=http://127.0.0.1:%PORT%/index.html

rem Node first: tools\serve.js sends Cache-Control: no-cache, so an update is never hidden by the browser cache.
where node >nul 2>nul
if %errorlevel%==0 (
  start "Vision Nexus 2030 server" /min node tools\serve.js %PORT%
  goto open
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "Vision Nexus 2030 server" /min python -m http.server %PORT% --bind 127.0.0.1
  goto open
)
where py >nul 2>nul
if %errorlevel%==0 (
  start "Vision Nexus 2030 server" /min py -3 -m http.server %PORT% --bind 127.0.0.1
  goto open
)
echo Python 3 or Node.js is needed to run the local server.
echo Opening the classic renderer directly instead...
start "" "%~dp0index.html"
exit /b 0

:open
timeout /t 2 /nobreak >nul
start "" "%URL%"
echo Vision Nexus 2030 is running at %URL%
echo Close the "Vision Nexus 2030 server" window to stop it.
exit /b 0
