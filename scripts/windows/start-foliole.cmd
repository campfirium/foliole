@echo off
setlocal

set "FOLIOLE_REPO_ROOT=%~dp0..\.."
cd /d "%FOLIOLE_REPO_ROOT%"

set "FOLIOLE_ACTION=%~1"
if "%FOLIOLE_ACTION%"=="" set "FOLIOLE_ACTION=start"

if /i "%FOLIOLE_ACTION%"=="dev" set "FOLIOLE_ACTION=start"

if /i "%FOLIOLE_ACTION%"=="dev-direct" (
  npm run electron:dev:native
) else if /i "%FOLIOLE_ACTION%"=="start" (
  npm.cmd run windows:preview:native
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
