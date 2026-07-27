@echo off
rem ============================================================
rem Launcher for AI 3-Daejang Cafe (Windows)
rem Double-click to start Chrome and open the cafe.
rem  - If Chrome is closed: starting Chrome makes the extension
rem    open the cafe automatically (Settings > "open on start").
rem  - If Chrome is already running: brings it to front and
rem    presses Alt+3 for you.
rem
rem To pin: right-click this file > Send to > Desktop (create shortcut)
rem NOTE: English-only on purpose. Korean text breaks .bat files
rem       on Korean Windows (encoding mismatch).
rem ============================================================
setlocal

tasklist /FI "IMAGENAME eq chrome.exe" 2>nul | find /I "chrome.exe" >nul
if errorlevel 1 (
  echo Starting Chrome... the cafe will open shortly.
  start "" chrome.exe
) else (
  echo Chrome is already running - opening the cafe...
  powershell -NoProfile -Command "$w = New-Object -ComObject WScript.Shell; $w.AppActivate('Chrome') | Out-Null; Start-Sleep -Milliseconds 400; $w.SendKeys('%%3')"
)

exit /b 0
