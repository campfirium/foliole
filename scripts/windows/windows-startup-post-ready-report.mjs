function eventTime(event) {
  const value = Date.parse(event?.timestamp ?? '');
  return Number.isFinite(value) ? value : null;
}

export function collectPostReadyActivity(events, byStage, budgets) {
  const appReadyAt = eventTime(byStage.get('app_ready'));
  if (appReadyAt === null) {
    return {
      hydrateCount: 0,
      longBackgroundTasks: [],
      windowMs: budgets.postReadyWindowMs
    };
  }
  const endAt = appReadyAt + budgets.postReadyWindowMs;
  const postReadyEvents = events.filter((event) => {
    const timestamp = eventTime(event);
    return timestamp !== null && timestamp >= appReadyAt && timestamp <= endAt;
  });
  const longBackgroundTasks = postReadyEvents
    .filter((event) => event.stage === 'desktop_task_completed' && event.payload?.durationMs > budgets.backgroundTaskMs)
    .map((event) => ({
      durationMs: event.payload.durationMs,
      id: event.payload.id ?? null,
      label: event.payload.label ?? 'unknown'
    }));
  return {
    hydrateCount: postReadyEvents.filter((event) => event.stage === 'workspace_hydrate_runtime_complete').length,
    longBackgroundTasks,
    windowMs: budgets.postReadyWindowMs
  };
}
