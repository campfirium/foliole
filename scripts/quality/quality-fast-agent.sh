#!/usr/bin/env bash
set -euo pipefail
# Give the guarded command a separate process group on macOS.
set -m

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/quality-gate-lib.sh"

cleanup() {
  if [[ -n "${QUALITY_GATE_ACTIVE_PGID:-}" ]]; then
    terminate_process_group "${QUALITY_GATE_ACTIVE_PGID}"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

log_file="$(create_quality_gate_log_file "quality-fast-agent")"
status=0
run_command_with_limits quality-fast-agent "${log_file}" 0 0 'quality:fast' npm run quality:fast || status=$?
cat "${log_file}"
printf '[quality-fast-agent] sampled peak RSS: %s KiB\n' "${QUALITY_GATE_LAST_PEAK_RSS_KB}"
exit "${status}"
