@echo off
setlocal enabledelayedexpansion
title PetFocus - Push to GitHub

echo ==========================================
echo   PetFocus - Push to GitHub
echo ==========================================
echo.

cd /d "%~dp0"

echo [1/5] Checking git...
where git >nul 2>nul
if errorlevel 1 (
  echo   ERROR: git not found in PATH.
  echo   Fix: add D:\APP\git\cmd to user PATH, then reopen this file.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('git --version') do echo   %%v

echo [2/5] Checking remote...
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo   ERROR: remote "origin" is not set.
  echo   Fix: git remote add origin https://github.com/ctrl-123/petfocus.git
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%u in ('git remote get-url origin') do echo   %%u

echo [3/5] Connecting to GitHub...
git ls-remote --heads origin >nul 2>nul
if errorlevel 1 (
  echo   ERROR: cannot reach GitHub.
  echo.
  echo   Most likely the Steam++ accelerator changed its certificate,
  echo   or the CA bundle is missing. Fix by running:
  echo       node tools\setup-git-tls.mjs
  echo.
  pause
  exit /b 1
)
echo   OK

echo [4/5] Committing local changes...
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "chore: update"
  if errorlevel 1 (
    echo   ERROR: commit failed. See messages above.
    echo.
    pause
    exit /b 1
  )
) else (
  echo   Nothing new to commit.
)

echo [5/5] Pushing...
echo.
echo   A browser window may open to sign in to GitHub.
echo   If a dialog asks for a credential helper, choose "Manager".
echo.
git push -u origin main
set "EXITCODE=%ERRORLEVEL%"

echo.
if "%EXITCODE%"=="0" (
  echo ==========================================
  echo   Done. Your code is on GitHub.
  echo ==========================================
  echo.
  echo   https://github.com/ctrl-123/petfocus
  echo.
  echo   Next: deploy on Vercel
  echo     https://vercel.com/new
) else (
  echo ==========================================
  echo   Push failed. exit code = %EXITCODE%
  echo ==========================================
  echo.
  echo   If it says "could not read Username", the credential prompt
  echo   could not open. Try running this file again, or run
  echo   "git push -u origin main" manually in a PowerShell window.
)
echo.
pause
