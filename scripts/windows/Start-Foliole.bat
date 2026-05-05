@echo off
setlocal

set "DISTRO=Ubuntu"
set "PROJECT_DIR=/home/zephu/projects/foliole"

echo [Foliole] Restarting Tauri dev session in WSL...
rem Step 1: best-effort cleanup (ignore failures)
wsl -d %DISTRO% --cd %PROJECT_DIR% bash -lc "pkill -f 'target/debug/foliole-tauri-core' >/dev/null 2>&1 || true; pkill -f 'tauri dev' >/dev/null 2>&1 || true; pkill -f 'vite --host 127.0.0.1 --port 1420' >/dev/null 2>&1 || true"

rem Step 2: launch dev server + tauri and keep this console attached
wsl -d %DISTRO% --cd %PROJECT_DIR% bash -lc "npm run tauri:dev:wslg"

if errorlevel 1 (
  echo.
  echo [Foliole] Startup exited with error. Press any key to close.
  pause >nul
)

endlocal
