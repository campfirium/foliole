export function completeTimedOutRun(state, runId, message) {
  const now = Date.now();
  if (runId && state.runs[runId]?.status !== 'completed') {
    state.runs[runId] = {
      ...state.runs[runId],
      completedAt: now,
      error: message,
      exitCode: 1,
      status: 'completed'
    };
  }
  if (state.activeRunId === runId) {
    state.activeRunId = null;
  }
  state.acceptingUntil = 0;
}
