@echo off
cd /d %~dp0
start /min server.exe
timeout /t 3 /nobreak
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --new-window