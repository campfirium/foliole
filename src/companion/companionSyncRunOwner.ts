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

let activeSyncRun: ActiveSyncRun | null = null;

export function loadActiveCompanionSyncRun() {
  return activeSyncRun;
}

export function runCompanionSyncAsOwner<T>(
  _endpointUrl: string,
  runId: string,
  work: () => Promise<T>
): CompanionSyncRunHandle<T> {
  const activeRun = activeSyncRun;
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
  activeSyncRun = active;
  const release = () => {
    if (activeSyncRun === active) activeSyncRun = null;
  };
  void Promise.resolve().then(work).then(resolveRun, rejectRun);
  void completion.then(release, release);
  return { completion, mode: 'owned', runId };
}
