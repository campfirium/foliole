export function createSyncState(endpointUrl: string | null) {
  return {
    endpoint_url: endpointUrl,
    last_synced_at: endpointUrl ? '2026-04-22T12:00:00.000Z' : null,
    remembered_targets: endpointUrl ? [endpointUrl] : [],
    sync_events: [],
    sync_onboarding_status: 'completed' as const,
    workspace_snapshot: null
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
