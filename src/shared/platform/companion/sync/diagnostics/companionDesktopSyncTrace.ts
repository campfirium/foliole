import { Capacitor } from '@capacitor/core';

type SyncTraceFields = Record<string, number | string | boolean | null | undefined>;

function writeSyncTrace(runId: string | undefined, stage: string,
  status: 'started' | 'completed' | 'failed', fields: SyncTraceFields) {
  if (!runId || Capacitor.getPlatform() !== 'android') return;
  try {
    console.info('[FolioleSync]', JSON.stringify({ runId, stage, status, ...fields }));
  } catch {
    // Diagnostics must not interrupt synchronization.
  }
}

/** Scheduling moments that sit outside any one run: local edits, triggers and run boundaries. */
export function traceCompanionSyncEvent(stage: string, status: 'started' | 'completed' | 'failed',
  fields: SyncTraceFields = {}) {
  writeSyncTrace('scheduler', stage, status, fields);
}

export async function traceCompanionSyncStep<T>(args: {
  runId: string | undefined;
  stage: string;
  fields?: SyncTraceFields;
  task: () => Promise<T>;
  completedFields?: (result: T) => SyncTraceFields;
}): Promise<T> {
  const startedAt = performance.now();
  writeSyncTrace(args.runId, args.stage, 'started', args.fields ?? {});
  try {
    const result = await args.task();
    writeSyncTrace(args.runId, args.stage, 'completed', {
      ...args.fields,
      ...args.completedFields?.(result),
      elapsedMs: Math.round(performance.now() - startedAt)
    });
    return result;
  } catch (error) {
    writeSyncTrace(args.runId, args.stage, 'failed', {
      ...args.fields,
      elapsedMs: Math.round(performance.now() - startedAt)
    });
    throw error;
  }
}
