@echo off
setlocal

call "%~dp0scripts\windows\start-codex-loop.cmd" %*
exit /b %ERRORLEVEL%
