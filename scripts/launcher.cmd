@echo off
rem Transcrape launcher - unpacked next to build\, run it from anywhere.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo node is not installed - get Node 22 or newer from https://nodejs.org
  exit /b 1
)

if "%HOST%"=="" set HOST=127.0.0.1
if "%PORT%"=="" set PORT=5173
rem Uploads are whole video files; adapter-node's 512 kB default would reject them.
if "%BODY_SIZE_LIMIT%"=="" set BODY_SIZE_LIMIT=Infinity

echo ==^> Transcrape on http://%HOST%:%PORT%  (ctrl-c to stop)
node build\index.js
