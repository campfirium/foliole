#!/usr/bin/env bash
set -euo pipefail

PORT="${FOLIOLE_DEV_SCREENSHOT_PORT:-38642}"
WINDOWS_MIRROR_WSL="${FOLIOLE_WINDOWS_MIRROR_WSL:-/mnt/d/C/foliole}"
TARGET_DIR="${FOLIOLE_DEV_SCREENSHOT_DIR:-.tmp/screenshots}"
TARGET_FILE="$TARGET_DIR/latest.png"
MIRROR_FILE="$WINDOWS_MIRROR_WSL/$TARGET_DIR/latest.png"

if command -v powershell.exe >/dev/null 2>&1; then
  powershell.exe -NoProfile -WindowStyle Hidden -Command "\$ErrorActionPreference = 'Stop'; Invoke-WebRequest -UseBasicParsing -Method POST -Uri 'http://127.0.0.1:$PORT/dev/screenshot' | Out-Null"
elif command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -Command "\$ErrorActionPreference = 'Stop'; Invoke-WebRequest -UseBasicParsing -Method POST -Uri 'http://127.0.0.1:$PORT/dev/screenshot' | Out-Null"
else
  node -e "const port=process.env.FOLIOLE_DEV_SCREENSHOT_PORT||'38642'; fetch('http://127.0.0.1:'+port+'/dev/screenshot',{method:'POST'}).then(async r=>{if(!r.ok) throw new Error(await r.text());}).catch(e=>{console.error(e.message); process.exit(1);})"
fi

mkdir -p "$TARGET_DIR"
if [[ -f "$MIRROR_FILE" ]]; then
  cp "$MIRROR_FILE" "$TARGET_FILE"
fi

if [[ ! -f "$TARGET_FILE" ]]; then
  echo "screenshot was requested, but $TARGET_FILE was not found" >&2
  exit 1
fi

echo "$TARGET_FILE"
