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

export function isTrustedRunningStatus(status, { expectedHead = '' } = {}) {
  if (status.status !== 'RUNNING' || !status.trusted) {
    return false;
  }
  return !expectedHead || status.head === expectedHead;
}

export function isMatchingPreviewDelivery(delivery, intent) {
  return (
    Number(delivery?.nonce) === intent.nonce &&
    delivery?.requestedAt === intent.requestedAt
  );
}

export function isBootEventAfterIntent(event, intent) {
  if (event?.stage !== 'app_ready') {
    return false;
  }
  const eventTime = Date.parse(event.timestamp ?? '');
  const intentTime = Date.parse(intent.requestedAt ?? '');
  return Number.isFinite(eventTime) && Number.isFinite(intentTime) && eventTime >= intentTime;
}

export function isShellConfigFile(file) {
  return /^(tailwind\.config\.(js|cjs|mjs|ts)|postcss\.config\.(js|cjs|mjs|ts)|vite\.config\.(js|cjs|mjs|ts)|vite\.shared\.ts|package\.json|package-lock\.json|scripts\/electron-dev\.mjs|scripts\/electron-dev-server\.mjs|scripts\/windows\/electron-dev-native\.mjs|scripts\/windows\/windows-client-native.*\.mjs|scripts\/windows\/windows-preview-native.*\.mjs|scripts\/windows\/start-electron-dev-native\.ps1)$/u.test(file);
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
  if (/^src\/(global\.d\.ts|main\.tsx|startupBootstrap\.ts|startupViewMode\.ts)$/u.test(file)) {
    return true;
  }
  if (!/^(src\/app\/|src\/features\/|src\/shared\/|src\/store\/)/u.test(file)) {
    return false;
  }
  return !/\.(test|spec)\.(ts|tsx|mjs|js)$/u.test(file);
}

export function isStartupRendererFile(file) {
  return /^(src\/main\.tsx|src\/startupBootstrap\.ts|src\/startupViewMode\.ts|src\/app\/App\.tsx|src\/app\/components\/ImportSourceWorkspace\.tsx|src\/app\/components\/WorkspaceLayout.*\.tsx|src\/app\/components\/WorkspaceRightSidebar.*\.tsx|src\/app\/components\/WorkspaceSettingsOverlay.*\.tsx|src\/shared\/platform\/bridge\.ts|src\/shared\/platform\/runtimeBootTelemetry\.ts)$/u.test(file);
}

function hasFile(files, predicate) {
  return files.some((file) => predicate(file));
}

export function selectNativePreviewAction({ changedFiles, currentHead, status }) {
  return selectNativePreviewActionWithCommittedFiles({
    changedFiles,
    committedFilesSinceRuntime: [],
    currentHead,
    status
  });
}

export function selectNativePreviewActionWithCommittedFiles({
  changedFiles,
  committedFilesSinceRuntime = [],
  currentHead,
  status
}) {
  if (status.status === 'RUNNING' && status.trusted) {
    if (hasFile(changedFiles, isShellConfigFile)) {
      return { action: 'full-restart', reason: 'Class D: working tree shell/vite config changes detected' };
    }
    if (committedFilesSinceRuntime === null && status.head && currentHead && status.head !== currentHead) {
      return { action: 'full-restart', reason: 'Class D: runtime head cannot be compared to current checkout' };
    }
    if (hasFile(committedFilesSinceRuntime, isShellConfigFile)) {
      return { action: 'full-restart', reason: 'Class D: runtime behind committed shell/vite config changes' };
    }
    if (hasFile(changedFiles, isStartupRendererFile)) {
      return { action: 'full-restart', reason: 'Class D: working tree startup renderer changes detected' };
    }
    if (hasFile(committedFilesSinceRuntime, isStartupRendererFile)) {
      return { action: 'full-restart', reason: 'Class D: runtime behind committed startup renderer changes' };
    }
    if (hasFile(changedFiles, isRuntimeFile)) {
      if (hasFile(changedFiles, isRendererSourceFile)) {
        return { action: 'restart-intent', reason: 'Class B: working tree runtime and renderer changes detected' };
      }
      return { action: 'restart-intent', reason: 'Class B: working tree electron changes detected' };
    }
    if (hasFile(committedFilesSinceRuntime, isRuntimeFile)) {
      if (hasFile(changedFiles, isRendererSourceFile)) {
        return { action: 'restart-intent', reason: 'Class B: runtime behind committed electron changes with renderer changes' };
      }
      return { action: 'restart-intent', reason: 'Class B: runtime behind committed electron changes' };
    }
    if (hasFile(changedFiles, isRendererSourceFile) || hasFile(committedFilesSinceRuntime, isRendererSourceFile)) {
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
