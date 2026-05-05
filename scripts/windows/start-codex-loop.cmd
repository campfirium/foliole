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

set "LOG_PATH=.lab/internal/runtime/agent-loop.log"
set "PID_PATH=.lab/internal/runtime/agent-loop.pid"
set "LOOP_ARGS=%*"

wsl.exe bash -lc "cd \"%REPO_WSL%\" && mkdir -p .lab/internal/runtime && (nohup bash scripts/codex/run-loop.sh %LOOP_ARGS% > \"%LOG_PATH%\" 2>&1 < /dev/null & echo \$! > \"%PID_PATH%\")"
if errorlevel 1 (
  echo [codex-loop] failed to launch background loop.
  exit /b 1
)

for /f "usebackq delims=" %%i in (`wsl.exe bash -lc "cd \"%REPO_WSL%\" && cat \"%PID_PATH%\" 2>/dev/null"`) do set "LOOP_PID=%%i"

echo [codex-loop] started in background.
if defined LOOP_PID echo [codex-loop] pid: %LOOP_PID%
echo [codex-loop] log: %LOG_PATH%
echo [codex-loop] tail: wsl.exe bash -lc "cd \"%REPO_WSL%\" && tail -n 80 \"%LOG_PATH%\""
