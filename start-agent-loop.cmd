@echo off
setlocal
start "Foliole Agent Loop" cmd.exe /k call "%~dp0scripts\windows\start-codex-loop-live.cmd" %*
exit /b 0
