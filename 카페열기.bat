@echo off
rem ============================================================
rem Launcher for AI 3-Daejang Cafe (Windows)
rem
rem Double-click to open the cafe. Works whether Chrome is
rem already running or not, and needs no special permissions.
rem
rem How it works: it opens a marker URL (#3ai-cafe). The
rem extension sees the marker and arranges the three AI windows
rem plus the command bar.
rem
rem To pin: right-click this file > Send to > Desktop (create shortcut)
rem NOTE: English-only on purpose. Korean text breaks .bat files
rem       on Korean Windows (encoding mismatch).
rem ============================================================
start "" chrome.exe "https://gemini.google.com/app#3ai-cafe"
exit /b 0
