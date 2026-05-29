#!/usr/bin/env bash
set -euo pipefail

runtime_dir="${FOLIOLE_FREEZE_RUNTIME_DIR:-.lab/internal/runtime}"
pid_file="$runtime_dir/freeze-sampler.pid"
out_file="$runtime_dir/freeze-sampler.out"
interval_ms="${FOLIOLE_FREEZE_INTERVAL_MS:-20000}"

mkdir -p "$runtime_dir"

if [[ -f "$pid_file" ]]; then
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    echo "[diag:freeze] already running pid=$pid"
    exit 0
  fi
fi

setsid -f env \
  FOLIOLE_FREEZE_INTERVAL_MS="$interval_ms" \
  FOLIOLE_FREEZE_RUNTIME_DIR="$runtime_dir" \
  node scripts/dev-freeze-snapshot.mjs --watch > "$out_file" 2>&1 < /dev/null

sleep 1
pid="$(cat "$pid_file")"
echo "[diag:freeze] started pid=$pid interval=${interval_ms}ms log=$runtime_dir/freeze-sampler.jsonl"
