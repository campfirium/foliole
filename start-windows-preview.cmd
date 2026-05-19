@echo off
setlocal

call "%~dp0scripts\windows\start-windows-preview.cmd" %*
exit /b %ERRORLEVEL%
