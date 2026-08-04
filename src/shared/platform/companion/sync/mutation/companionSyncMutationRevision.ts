import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue';

type MutationListener = () => void;

let mutationRevision = 0;
const mutationListeners = new Set<MutationListener>();

export function getCompanionSyncMutationRevision() {
  return mutationRevision;
}

export function subscribeCompanionSyncMutationRevision(listener: MutationListener) {
  mutationListeners.add(listener);
  return () => mutationListeners.delete(listener);
}

function publishMutationRevision() {
  mutationRevision += 1;
  for (const listener of mutationListeners) {
    try {
      listener();
    } catch {
      // A committed native write must not be reported as failed by an observer.
    }
  }
}

export async function runCompanionSyncMutationTask<T>(task: () => Promise<T>) {
  const result = await runCompanionSyncWriterTask(task);
  publishMutationRevision();
  return result;
}

export async function runCompanionSyncOptionalMutationTask<T>(task: () => Promise<T | null>) {
  const result = await runCompanionSyncWriterTask(task);
  if (result !== null) publishMutationRevision();
  return result;
}
