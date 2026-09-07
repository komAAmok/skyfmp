@echo off
setlocal

rem SkyMP dedicated server launcher (Windows).
rem Double-click skymp-server.exe instead - this batch file is only a
rem compatibility shortcut that does the same thing.

cd /d "%~dp0"

rem Prefer the Node.js runtime bundled with the archive, fall back to PATH.
set "NODE_EXE=%~dp0node.exe"
if not exist "%NODE_EXE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo.
    echo [ERROR] Neither node.exe next to this file nor Node.js in PATH were found.
    echo Re-extract the server archive fully.
    echo.
    pause
    exit /b 1
  )
  set "NODE_EXE=node"
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

"%NODE_EXE%" dist_back\skymp5-server.js
set EXIT_CODE=%ERRORLEVEL%

echo.
echo Server stopped with exit code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%