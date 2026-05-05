#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: scripts/task-finish.sh M1-XX \"result summary\""
  exit 1
fi

TASK_ID="$1"
RESULT="$2"
DATE="$(date +%F)"
LOG_FILE=".lab/agent/iteration-log.md"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "Missing $LOG_FILE"
  exit 1
fi

{
  echo ""
  echo "## ${DATE} ${TASK_ID} DONE"
  echo "- 状态: Done"
  echo "- 结果: ${RESULT}"
  echo "- 验证: 请补充命令或手动验证步骤"
  echo "- 后续: 选择下一个 M1 任务继续"
} >> "$LOG_FILE"

echo "Finished ${TASK_ID}."
