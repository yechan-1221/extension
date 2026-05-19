@echo off
cd /d C:\Users\EL092\upright_ai
start /min python local_server/server.py
timeout /t 3 /nobreak
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --new-window