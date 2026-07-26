@echo off
rem ============================================================
rem 3AI Bridge one-click updater (Windows)
rem Downloads the latest version from GitHub into this folder.
rem After it finishes: open chrome://extensions and click reload.
rem NOTE: This file is intentionally English-only. Korean text in
rem       .bat files breaks on Korean Windows (encoding mismatch).
rem ============================================================
setlocal
cd /d "%~dp0"

echo.
echo [3AI Bridge] Downloading the latest version...
echo.

set "TMPD=%TEMP%\3ai-bridge-upd"
rmdir /s /q "%TMPD%" 2>nul
mkdir "%TMPD%"

curl.exe -L -sS -o "%TMPD%\main.zip" https://github.com/hankyungwon/3ai-bridge/archive/refs/heads/main.zip
if errorlevel 1 goto fail

tar.exe -xf "%TMPD%\main.zip" -C "%TMPD%"
if errorlevel 1 goto fail

rem Copy everything except .bat files (a running .bat must not
rem overwrite itself). robocopy exit codes 0-7 mean success.
robocopy "%TMPD%\3ai-bridge-main" "%CD%" /e /xf *.bat >nul
if errorlevel 8 goto fail

rmdir /s /q "%TMPD%" 2>nul

echo ============================================
echo  OK! Update complete. (files are in place)
echo.
echo  Next step:
echo   1. Open Chrome and go to  chrome://extensions
echo   2. Click the reload (circular arrow) button
echo      on the "3AI Bridge" card.
echo ============================================
pause
exit /b 0

:fail
echo ============================================
echo  UPDATE FAILED.
echo  - Check your internet connection.
echo  - Take a photo of this window and send it to Claude.
echo ============================================
pause
exit /b 1
