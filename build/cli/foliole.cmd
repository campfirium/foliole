@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
set "FOLIOLE_PRODUCT_METADATA_PATH=%~dp0..\resources\app.asar\package.json"
"%~dp0..\Foliole.exe" "%~dp0..\resources\scripts\agent-control\foliole-agent.mjs" %*
exit /b %ERRORLEVEL%
