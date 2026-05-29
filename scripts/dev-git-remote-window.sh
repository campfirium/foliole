#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/zephu/projects/foliole"
REMOTE_NAME="origin"
BRANCH_NAME="dev"
URL_CONFIG_KEY="foliole.remoteWindow.url"
LOCK_FILE="/home/zephu/.cache/foliole-git-remote-window.lock"

usage() {
  cat <<'USAGE'
Usage: dev-git-remote-window.sh <connect|disconnect|push|status>

connect     Restore remote.origin.url from foliole.remoteWindow.url.
disconnect  Remove remote.origin.url if it matches the stored window URL.
push        Restore remote, then run: git push origin dev.
status      Print current remote window state.
USAGE
}

run_git() {
  git -C "$REPO_DIR" "$@"
}

stored_url() {
  run_git config --local --get "$URL_CONFIG_KEY"
}

current_url() {
  run_git config --local --get "remote.${REMOTE_NAME}.url" 2>/dev/null || true
}

connect_remote() {
  local url
  url="$(stored_url)"
  if [[ -z "$url" ]]; then
    echo "missing $URL_CONFIG_KEY" >&2
    return 1
  fi
  run_git remote set-url "$REMOTE_NAME" "$url"
  echo "connected $REMOTE_NAME"
}

disconnect_remote() {
  local expected current
  expected="$(stored_url)"
  current="$(current_url)"
  if [[ -z "$current" ]]; then
    echo "already disconnected $REMOTE_NAME"
    return 0
  fi
  if [[ "$current" != "$expected" ]]; then
    echo "refusing to remove unexpected $REMOTE_NAME url: $current" >&2
    return 1
  fi
  run_git config --local --unset "remote.${REMOTE_NAME}.url"
  echo "disconnected $REMOTE_NAME"
}

push_remote() {
  connect_remote
  run_git push "$REMOTE_NAME" "$BRANCH_NAME"
}

status_remote() {
  local current
  current="$(current_url)"
  if [[ -n "$current" ]]; then
    echo "connected $REMOTE_NAME $current"
  else
    echo "disconnected $REMOTE_NAME"
  fi
}

main() {
  local action="${1:-}"
  mkdir -p "$(dirname "$LOCK_FILE")"
  case "$action" in
    connect)
      flock "$LOCK_FILE" bash -c "$(declare -f run_git stored_url connect_remote); REPO_DIR='$REPO_DIR'; REMOTE_NAME='$REMOTE_NAME'; URL_CONFIG_KEY='$URL_CONFIG_KEY'; connect_remote"
      ;;
    disconnect)
      flock "$LOCK_FILE" bash -c "$(declare -f run_git stored_url current_url disconnect_remote); REPO_DIR='$REPO_DIR'; REMOTE_NAME='$REMOTE_NAME'; URL_CONFIG_KEY='$URL_CONFIG_KEY'; disconnect_remote"
      ;;
    push)
      flock "$LOCK_FILE" bash -c "$(declare -f run_git stored_url connect_remote push_remote); REPO_DIR='$REPO_DIR'; REMOTE_NAME='$REMOTE_NAME'; BRANCH_NAME='$BRANCH_NAME'; URL_CONFIG_KEY='$URL_CONFIG_KEY'; push_remote"
      ;;
    status)
      status_remote
      ;;
    *)
      usage >&2
      return 2
      ;;
  esac
}

main "$@"
