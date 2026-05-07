const activeSyncRuns = new Map<string, Promise<void>>();

function syncRunKey(endpointUrl: string) {
  return endpointUrl.trim();
}

export async function runCompanionSyncAsOwner<T>(
  endpointUrl: string,
  work: () => Promise<T>
): Promise<{ owned: true; result: T } | { owned: false }> {
  const key = syncRunKey(endpointUrl);
  const activeRun = activeSyncRuns.get(key);
  if (activeRun) {
    await activeRun;
    return { owned: false };
  }
  let resolveDone = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  activeSyncRuns.set(key, done);
  try {
    const result = await work();
    return { owned: true, result };
  } finally {
    if (activeSyncRuns.get(key) === done) {
      activeSyncRuns.delete(key);
    }
    resolveDone();
  }
}
