@echo off
setlocal
set "SCRIPT_DIR=%~dp0."

for /f "usebackq delims=" %%i in (`powershell.exe -NoProfile -Command "$path = [System.IO.Path]::GetFullPath('%SCRIPT_DIR%\..\..'); if ($path -match '^\\\\wsl(?:\.localhost|\$)\\[^\\]+\\(.+)$') { '/' + ($Matches[1].Replace('\', '/').TrimEnd('/')) }"`) do set "REPO_WSL=%%i"
if not defined REPO_WSL (
  for /f "usebackq delims=" %%i in (`wsl.exe wslpath "%SCRIPT_DIR%\..\.."`) do set "REPO_WSL=%%i"
)

if not defined REPO_WSL (
  echo [windows-preview] failed to resolve repository path into WSL.
  exit /b 1
)

echo [windows-preview] repository: %REPO_WSL%
echo [windows-preview] running: npm run windows:preview
wsl.exe bash -lc "cd \"%REPO_WSL%\" && npm run windows:preview"
set "PREVIEW_EXIT=%ERRORLEVEL%"

if not "%PREVIEW_EXIT%"=="0" (
  echo [windows-preview] failed with exit code %PREVIEW_EXIT%.
  exit /b %PREVIEW_EXIT%
)

echo [windows-preview] done.
exit /b 0
