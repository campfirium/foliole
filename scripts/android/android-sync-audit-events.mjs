function syncEventSummary(db) {
  const events = parseSyncEvents(metaValue(db, 'workspace_sync_events'));
  const latestRun = events.find((event) => event?.kind === 'run_finished') ?? null;
  return {
    count: events.length,
    kindCounts: countEventKinds(events),
    latestRun: latestRun ? summarizeSyncRun(latestRun) : null
  };
}

function metaValue(db, key) {
  try {
    return db.prepare('SELECT value FROM companion_meta WHERE key = ?').get(key)?.value ?? null;
  } catch {
    return null;
  }
}

function parseSyncEvents(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function countEventKinds(events) {
  return events.reduce((counts, event) => {
    const kind = typeof event?.kind === 'string' ? event.kind : 'legacy_event';
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeSyncRun(event) {
  return {
    kind: event.kind,
    message: typeof event.message === 'string' ? event.message : '',
    occurredAt: event.occurred_at ?? event.occurredAt ?? null,
    result: event.result ?? null,
    runId: event.run_id ?? event.runId ?? null
  };
}

export { syncEventSummary };
