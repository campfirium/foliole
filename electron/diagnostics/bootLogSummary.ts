const backgroundStages = new Set([
  'desktop_task_submitted',
  'desktop_task_started',
  'desktop_task_completed',
  'desktop_task_progress',
  'desktop_task_cancelled',
  'desktop_task_skipped',
  'workspace_hydrate_refresh_start',
  'workspace_hydrate_refresh_end'
]);

const measurementKeys = [
  'attempt', 'column', 'driftMs', 'durationMs', 'elapsedMs', 'errorCode', 'intervalMs', 'line',
  'nodeCount', 'nodeViewStateCount', 'totalMs'
];
const stateKeys = [
  'isFullScreen', 'isMainFrame', 'isMaximized', 'isReviewSchedulerSettingsReady', 'isVisible',
  'isWorkspaceHydrated', 'nativeInvokeReady', 'rootPresent', 'show'
];
const summaries = {
  kind: ['workspace', 'startup-error', 'library-setup'],
  moduleLabel: ['Workspace shell', 'Database migration', 'Startup services'],
  readyState: ['loading', 'interactive', 'complete'],
  source: ['workspace_hydrated', 'workspace_hydrated_hidden_window', 'workspace_hydrated_double_raf', 'startup_watchdog_bridge_ready'],
  startupView: ['workspace', 'startup-error', 'library-setup']
};

export function shouldPersistOrdinaryBootStage(stage: string) {
  return !backgroundStages.has(stage);
}

export function summarizeBootPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const input = payload as Record<string, unknown>;
  const summary: Record<string, boolean | number | string> = {};
  for (const key of measurementKeys) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) summary[key] = value;
  }
  for (const key of stateKeys) {
    const value = input[key];
    if (typeof value === 'boolean') summary[key] = value;
  }
  for (const [key, values] of Object.entries(summaries)) {
    const value = input[key];
    if (typeof value === 'string' && values.includes(value)) summary[key] = value;
  }
  return Object.keys(summary).length ? summary : null;
}
