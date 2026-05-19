const PREVIEW_FAILURE_PATTERNS = [
  /预览.*(?:没完成|未完成|失败|没有完成)/u,
  /预览.*(?:restart|full restart|START_FAILED|RESTART_FAILED).*失败/iu,
  /预览.*(?:启动失败|fallback-start|shell-exited)/iu,
  /预览.*(?:健康检查|没收绿|未收绿|app-ready-timeout|app_ready_timeout)/iu,
  /Windows\s*预览已同步/iu,
  /preview-dedupe.*waiting/u,
  /(?:停止|杀掉|终止).*挂起.*(?:预览|进程)/u,
  /挂起进程/u,
  /(?:不能|不)(?:标|写)\s*pushed/iu,
  /preview\s+(?:failed|did not complete|never reached|was not completed)/iu,
  /preview-dedupe.*waiting/iu,
  /(?:START_FAILED|RESTART_FAILED|full restart failed|startup health check failed|fallback-start|shell-exited|app-ready-timeout|app_ready_timeout)/iu
];

function firstMatchingLine(message, patterns) {
  return message
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => patterns.some((pattern) => pattern.test(line)));
}

export function assertAgentCompletionMessage(message) {
  const previewFailureLine = firstMatchingLine(message, PREVIEW_FAILURE_PATTERNS);
  if (!previewFailureLine) {
    return;
  }
  throw new Error(`agent reported preview failure instead of continuing: ${previewFailureLine}`);
}
