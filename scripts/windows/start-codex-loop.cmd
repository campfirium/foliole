@echo off
setlocal

for /f "usebackq delims=" %%i in (`wsl.exe wslpath "%~dp0..\.."`) do set "REPO_WSL=%%i"

if not defined REPO_WSL (
  echo [codex-loop] failed to resolve repository path into WSL.
  exit /b 1
)

wsl.exe bash -lc "cd \"%REPO_WSL%\" && bash scripts/codex/run-loop.sh %*"
