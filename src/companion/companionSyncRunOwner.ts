import { requestAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget.js';
import { traceCompanionSyncEvent } from '../shared/platform/companion/sync/diagnostics/companionDesktopSyncTrace.js';

type SyncRunIntent = { manualRequested: boolean };

type ActiveSyncRun = {
  endpointUrl: string;
  intent: SyncRunIntent;
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
  endpointUrl: string,
  runId: string,
  work: (intent: SyncRunIntent) => Promise<T>,
  manualRequested = false
): CompanionSyncRunHandle<T> {
  const activeRun = activeSyncRun;
  if (activeRun) {
    requestAttachmentWorkYield();
    if (manualRequested) activeRun.intent.manualRequested = true;
    return { completion: activeRun.completion, mode: 'joined', runId: activeRun.runId };
  }
  let resolveRun: (result: T) => void = () => undefined;
  let rejectRun: (error: unknown) => void = () => undefined;
  const completion = new Promise<T>((resolve, reject) => {
    resolveRun = resolve;
    rejectRun = reject;
  });
  const active: ActiveSyncRun = { endpointUrl, completion, runId, intent: { manualRequested } };
  activeSyncRun = active;
  const release = () => {
    if (activeSyncRun === active) activeSyncRun = null;
  };
  traceCompanionSyncEvent('sync_run', 'started');
  void Promise.resolve().then(() => work(active.intent)).then(resolveRun, rejectRun)
    .finally(() => traceCompanionSyncEvent('sync_run', 'completed'));
  void completion.then(release, release);
  return { completion, mode: 'owned', runId };
}
