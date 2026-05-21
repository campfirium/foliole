@echo off
setlocal

cd /d "%~dp0"

set "FOLIOLE_ACTION=%~1"
if "%FOLIOLE_ACTION%"=="" set "FOLIOLE_ACTION=dev"

if /i "%FOLIOLE_ACTION%"=="dev" (
  npm run electron:dev:native
) else (
  npm run windows:client:native -- %FOLIOLE_ACTION%
)
set "FOLIOLE_EXIT_CODE=%ERRORLEVEL%"

if not "%FOLIOLE_EXIT_CODE%"=="0" (
  echo.
  echo Foliole client command failed with exit code %FOLIOLE_EXIT_CODE%.
  echo Action: %FOLIOLE_ACTION%
  pause
)

exit /b %FOLIOLE_EXIT_CODE%
