@echo off
setlocal

rem SkyMP dedicated server launcher (Windows).
rem Run this file to start the server. Keep the window open while playing.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js was not found in PATH.
  echo Install Node.js 22 or newer from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "data\Skyrim.esm" (
  echo.
  echo [ERROR] data\Skyrim.esm is missing.
  echo Copy Skyrim.esm, Update.esm, Dawnguard.esm, HearthFires.esm and Dragonborn.esm
  echo from your own "Skyrim Special Edition\Data" folder into the "data" folder
  echo next to this file, then run this file again.
  echo.
  pause
  exit /b 1
)

echo Starting SkyMP server...
echo Players connect with the address ^<this machine's IP^>:7777 (F2 in game).
echo.

node dist_back\skymp5-server.js
set EXIT_CODE=%ERRORLEVEL%

echo.
echo Server stopped with exit code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
