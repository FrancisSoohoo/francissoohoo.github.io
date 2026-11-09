@echo off
rem Double-click to preview the portfolio. Starts a tiny local web server and opens your browser.
rem Close the "Portfolio server" window when you are done.
start "Portfolio server" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port 5173
timeout /t 2 /nobreak >nul
start "" http://localhost:5173/
