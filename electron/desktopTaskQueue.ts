import type { DesktopTaskProgressEventState } from './desktopTaskProgressEvents.js';
import { hasDesktopTaskResourceCapacity, usesDesktopTaskResource } from './desktopTaskResources.js';
import type { DesktopTaskDefinition, DesktopTaskResource } from './desktopTaskTypes.js';

export interface QueuedDesktopTask {
  attempt: number;
  controller: AbortController;
  databaseWriteBlocker?: string;
  definition: DesktopTaskDefinition;
  lastProgressEvent: DesktopTaskProgressEventState | null;
  promise: Promise<unknown>;
  reject: (error: unknown) => void;
  resolve: (value: unknown) => void;
  sequence: number;
  submittedAt: number;
  state: 'pending' | 'running' | 'finished';
}

export function createQueuedDesktopTask(
  definition: DesktopTaskDefinition,
  sequence: number,
  submittedAt: number
): QueuedDesktopTask {
  let resolveTask: (value: unknown) => void = () => {};
  let rejectTask: (error: unknown) => void = () => {};
  const promise = new Promise<unknown>((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });
  void promise.catch(() => undefined);
  return {
    attempt: 1,
    controller: new AbortController(),
    definition,
    lastProgressEvent: null,
    promise,
    reject: rejectTask,
    resolve: resolveTask,
    sequence,
    submittedAt,
    state: 'pending'
  };
}

export function isDesktopTaskAbortError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.message === 'AbortError');
}

export function isQueuedDesktopTaskRunnable(
  task: QueuedDesktopTask,
  pausedResources: ReadonlySet<DesktopTaskResource>,
  running: DesktopTaskDefinition[]
) {
  if (task.definition.resources?.some(claim => pausedResources.has(claim.resource))) return false;
  if (hasDesktopTaskResourceCapacity(task.definition, running)) return true;
  if (task.definition.priority === 'foreground' && usesDesktopTaskResource(task.definition, 'main-database-write')) {
    const blocker = running.find(definition => usesDesktopTaskResource(definition, 'main-database-write'));
    if (blocker) task.databaseWriteBlocker = blocker.source;
  }
  return false;
}
