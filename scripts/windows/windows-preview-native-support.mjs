export function parseWindowsClientStatus(output) {
  const statusLine = output.split(/\r?\n/u).find((line) => line.includes('[windows-restart-client] status:')) ?? '';
  return {
    detail: statusLine.replace(/^\[windows-restart-client\]\s*/u, ''),
    head: statusLine.match(/\bhead=([^\s]+)/u)?.[1] ?? '',
    reason: statusLine.match(/\breason=([^\s]+)/u)?.[1] ?? '',
    runtimePid: statusLine.match(/\bruntime_pid=([0-9]+)/u)?.[1] ?? '',
    status: statusLine.match(/status:\s*([A-Z_-]+)/u)?.[1] ?? '',
    trusted: /\btrust=OK\b/u.test(statusLine)
  };
}

export function isShellConfigFile(file) {
  return /^(tailwind\.config\.(js|cjs|mjs|ts)|postcss\.config\.(js|cjs|mjs|ts)|vite\.config\.(js|cjs|mjs|ts)|package\.json|package-lock\.json)$/u.test(file);
}

export function isRuntimeFile(file) {
  if (!/^(electron\/|lib\/core\/|lib\/platform\/)/u.test(file)) {
    return false;
  }
  if (/\.(test|spec)\.(ts|tsx|mjs|js)$/u.test(file)) {
    return false;
  }
  return !/(tsconfig\.json|\.eslintrc|\.prettierrc)$/u.test(file);
}

export function isRendererSourceFile(file) {
  if (!/^(src\/app\/|src\/features\/|src\/shared\/|src\/store\/)/u.test(file)) {
    return false;
  }
  return !/\.(test|spec)\.(ts|tsx|mjs|js)$/u.test(file);
}

function hasFile(files, predicate) {
  return files.some((file) => predicate(file));
}

export function selectNativePreviewAction({ changedFiles, currentHead, status }) {
  if (status.status === 'RUNNING' && status.trusted) {
    if (hasFile(changedFiles, isShellConfigFile)) {
      return { action: 'full-restart', reason: 'Class D: working tree shell/vite config changes detected' };
    }
    if (hasFile(changedFiles, isRuntimeFile)) {
      return { action: 'restart-intent', reason: 'Class B: working tree runtime changes detected' };
    }
    if (status.head && currentHead && status.head !== currentHead) {
      return { action: 'restart-intent', reason: 'Class B: runtime behind current checkout head' };
    }
    if (hasFile(changedFiles, isRendererSourceFile)) {
      return { action: 'renderer-reload-intent', reason: 'Class A: renderer source changes detected' };
    }
    return { action: 'sync-only', reason: 'Class A: no runtime changes detected' };
  }

  if (status.status === 'STOPPED') {
    return {
      action: 'fallback-start',
      reason: status.reason ? `Class C: no trusted running client (${status.reason})` : 'Class C: no trusted running client'
    };
  }

  return { action: 'status-probe-failed', reason: 'Class C: client status unavailable' };
}
