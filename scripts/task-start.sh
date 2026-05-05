#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/task-start.sh M1-XX [title]"
  exit 1
fi

TASK_ID="$1"
TITLE="${2:-}"
DATE="$(date +%F)"
LOG_FILE=".lab/agent/iteration-log.md"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "Missing $LOG_FILE"
  exit 1
fi

{
  echo ""
  echo "## ${DATE} ${TASK_ID} START"
  echo "- 任务: ${TASK_ID} ${TITLE}"
  echo "- 状态: Doing"
  echo "- 计划:"
  echo "  - [ ] 实施"
  echo "  - [ ] 验证"
  echo "  - [ ] 记录"
} >> "$LOG_FILE"

echo "Started ${TASK_ID}."
