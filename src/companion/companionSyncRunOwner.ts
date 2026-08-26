type ActiveSyncRun = {
  completion: Promise<unknown>;
  runId: string;
};

export type CompanionSyncRunHandle<T> = {
  completion: Promise<T>;
  mode: 'owned';
  runId: string;
} | {
  completion: Promise<unknown>;
  mode: 'joined';
  runId: string;
};

const activeSyncRuns = new Map<string, ActiveSyncRun>();

function syncRunKey(endpointUrl: string) {
  return endpointUrl.trim();
}

export function runCompanionSyncAsOwner<T>(
  endpointUrl: string,
  runId: string,
  work: () => Promise<T>
): CompanionSyncRunHandle<T> {
  const key = syncRunKey(endpointUrl);
  const activeRun = activeSyncRuns.get(key);
  if (activeRun) {
    return { completion: activeRun.completion, mode: 'joined', runId: activeRun.runId };
  }
  let resolveRun: (result: T) => void = () => undefined;
  let rejectRun: (error: unknown) => void = () => undefined;
  const completion = new Promise<T>((resolve, reject) => {
    resolveRun = resolve;
    rejectRun = reject;
  });
  const active: ActiveSyncRun = { completion, runId };
  activeSyncRuns.set(key, active);
  const release = () => {
    if (activeSyncRuns.get(key) === active) {
      activeSyncRuns.delete(key);
    }
  };
  void Promise.resolve().then(work).then(resolveRun, rejectRun);
  void completion.then(release, release);
  return { completion, mode: 'owned', runId };
}
