@echo off
setlocal

set "SCRIPT_DIR=%~dp0."

for /f "usebackq delims=" %%i in (`powershell.exe -NoProfile -Command "$path = [System.IO.Path]::GetFullPath('%SCRIPT_DIR%\..\..'); if ($path -match '^\\\\wsl\.localhost\\[^\\]+\\(.+)$') { '/' + ($Matches[1].Replace('\', '/').TrimEnd('/')) }"`) do set "REPO_WSL=%%i"
if not defined REPO_WSL (
  for /f "usebackq delims=" %%i in (`wsl.exe wslpath "%SCRIPT_DIR%\..\.."`) do set "REPO_WSL=%%i"
)

if not defined REPO_WSL (
  echo [codex-loop] failed to resolve repository path into WSL.
  exit /b 1
)

echo [codex-loop] running in foreground.
wsl.exe bash -lc "cd \"%REPO_WSL%\" && bash scripts/codex/run-loop.sh %*"
exit /b %ERRORLEVEL%
