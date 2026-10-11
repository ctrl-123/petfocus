@echo off
setlocal
title PetFocus Dev Server

echo ==========================================
echo   PetFocus - Dev Server
echo ==========================================
echo.

set "ROOT=%~dp0"
set "WEB=%ROOT%apps\web"
set "VITE=%WEB%\node_modules\vite\bin\vite.js"

echo [1/3] Checking node...
where node >nul 2>nul
if errorlevel 1 (
  echo   ERROR: node not found in PATH.
  echo   Expected at: D:\APP\Node.js\intall\node.exe
  echo   Fix: add D:\APP\Node.js\intall to user PATH, then reopen this file.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo   node %%v

echo [2/3] Checking dependencies...
if not exist "%VITE%" (
  echo   ERROR: vite not found.
  echo   Expected at: %VITE%
  echo   Fix: open a terminal in the repo root and run:  pnpm install
  echo.
  pause
  exit /b 1
)
echo   OK

echo [3/3] Starting server on http://localhost:5173/
echo.
echo   Keep this window open. Close it to stop the server.
echo.

start "" http://localhost:5173/

pushd "%WEB%"
node "%VITE%" --port 5173
set "EXITCODE=%ERRORLEVEL%"
popd

echo.
echo Server stopped. exit code = %EXITCODE%
echo If the page did not open, copy this URL manually:
echo   http://localhost:5173/
echo.
pause
