import type { WorkspaceRefreshScope } from '../../../../../../lib/core/database/workspaceSnapshotRefresh.js';
import { requestAttachmentWorkYield } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue';
import { registerCompanionWorkspaceRefresh } from '../../companionWorkspaceSnapshotStore.js';
import { getCompanionReadingScope } from '../../reading/companionReadingScope.js';
import { traceCompanionSyncEvent } from '../diagnostics/companionDesktopSyncTrace.js';

type MutationListener = () => void;

let mutationRevision = 0;
const mutationListeners = new Set<MutationListener>();
const highValueMutationListeners = new Set<MutationListener>();

export function getCompanionSyncMutationRevision() {
  return mutationRevision;
}

export function subscribeCompanionSyncMutationRevision(listener: MutationListener) {
  mutationListeners.add(listener);
  return () => mutationListeners.delete(listener);
}

export function subscribeCompanionHighValueMutation(listener: MutationListener) {
  highValueMutationListeners.add(listener);
  return () => highValueMutationListeners.delete(listener);
}

export function publishCompanionSyncMutationRevision(scope: WorkspaceRefreshScope) {
  registerCompanionWorkspaceRefresh(scope);
  mutationRevision += 1;
  for (const listener of mutationListeners) {
    try {
      listener();
    } catch {
      // A committed native write must not be reported as failed by an observer.
    }
  }
}

export function publishCompanionHighValueMutation(scope: WorkspaceRefreshScope) {
  requestAttachmentWorkYield();
  publishCompanionSyncMutationRevision(scope);
  for (const listener of highValueMutationListeners) {
    try {
      listener();
    } catch {
      // A committed native write must not be reported as failed by an observer.
    }
  }
}

export async function runCompanionSyncMutationTask<T>(task: () => Promise<T>, scope: WorkspaceRefreshScope) {
  const session = getCompanionReadingScope();
  const result = await runCompanionSyncWriterTask(task);
  if (session === getCompanionReadingScope()) publishCompanionSyncMutationRevision(scope);
  return result;
}

export async function runCompanionSyncOptionalMutationTask<T>(task: () => Promise<T | null>, scope: WorkspaceRefreshScope) {
  const session = getCompanionReadingScope();
  const result = await runCompanionSyncWriterTask(task);
  if (result !== null && session === getCompanionReadingScope()) publishCompanionSyncMutationRevision(scope);
  return result;
}

export async function runCompanionHighValueMutationTask<T>(task: () => Promise<T>, scope: WorkspaceRefreshScope) {
  const session = getCompanionReadingScope();
  const queuedAt = performance.now();
  let startedAt = queuedAt;
  const result = await runCompanionSyncWriterTask(() => { startedAt = performance.now(); return task(); });
  // Committed: the next line asks attachment work to yield, so this also marks the yield request.
  traceCompanionSyncEvent('local_edit', 'completed', { queuedMs: Math.round(startedAt - queuedAt),
    writeMs: Math.round(performance.now() - startedAt) });
  if (session === getCompanionReadingScope()) publishCompanionHighValueMutation(scope);
  return result;
}

export async function runCompanionOptionalHighValueMutationTask<T>(task: () => Promise<T | null>, scope: WorkspaceRefreshScope) {
  const session = getCompanionReadingScope();
  const result = await runCompanionSyncWriterTask(task);
  if (result !== null && session === getCompanionReadingScope()) publishCompanionHighValueMutation(scope);
  return result;
}
