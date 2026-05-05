@echo off
setlocal

set "FOLIOLE_CODEX_TASK=%*"

for /f "usebackq delims=" %%i in (`wsl.exe wslpath "%~dp0..\.."`) do set "REPO_WSL=%%i"

if not defined REPO_WSL (
  echo [codex-task] failed to resolve repository path into WSL.
  exit /b 1
)

wsl.exe bash -lc "cd \"%REPO_WSL%\" && bash scripts/codex/run-task.sh"
