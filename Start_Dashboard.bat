@echo off
title IMS Dashboard Manager
echo Starting IMS Backup Server...
start /min node server.js
echo.
echo Opening Dashboard...
start "" "http://127.0.0.1:5500/index.html"
echo.
echo ------------------------------------------
echo Dashboard is now LIVE! 
echo Keep this window open or minimize it.
echo To stop everything, close this window.
echo ------------------------------------------
pause
taskkill /f /im node.exe >nul 2>&1
exit
