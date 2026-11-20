export const flowTimingStages = [
  'action', 'flush', 'refresh', 'read-drain', 'day-check', 'day-reset', 'queue-build', 'queue-size', 'queue-reconcile',
  'refresh-wait', 'open', 'open-queue', 'open-writer', 'mutation-queue', 'mutation-writer', 'write',
  'write-cycle', 'choose-next', 'dive-choose-next', 'read-admission', 'read-journal', 'read-next-wait',
  'read-next-hit', 'read-next-pending', 'read-next-miss', 'read-background', 'read-settle', 'receipt', 'mutation-publication', 'display', 'body', 'body-missing', 'body-fetching', 'editor-ready'
] as const;
export const flowTimingStatuses = ['start', 'done', 'failed', 'skipped', 'cancelled', 'empty', 'superseded'] as const;
export type FlowTimingStage = typeof flowTimingStages[number];
export type FlowTimingStatus = typeof flowTimingStatuses[number];
export type FlowTiming = (stage: FlowTimingStage, status: FlowTimingStatus, count?: number) => void;

export function timeFlow<T>(timing: FlowTiming | undefined, stage: FlowTimingStage, task: () => Promise<T>) {
  return timing ? measure(timing, stage, task) : task();
}

async function measure<T>(timing: FlowTiming, stage: FlowTimingStage, task: () => Promise<T>) {
  timing(stage, 'start');
  try {
    const result = await task();
    timing(stage, 'done');
    return result;
  } catch (error) {
    timing(stage, 'failed');
    throw error;
  }
}

export function timeFlowQueue<T>(timing: FlowTiming | undefined, stage: FlowTimingStage,
  enqueue: (task: () => Promise<T>) => Promise<T>, task: () => Promise<T>) {
  if (!timing) return enqueue(task);
  timing(stage, 'start');
  let started = false;
  return enqueue(() => {
    started = true;
    timing(stage, 'done');
    return task();
  }).catch((error: unknown) => {
    if (!started) timing(stage, 'failed');
    throw error;
  });
}
