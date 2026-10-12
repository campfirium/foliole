import { appendFileSync } from 'node:fs';
import path from 'node:path';

import type { RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';

export function snapshotTrace(stage: string, event: string, error?: unknown) {
  const root = process.env.FOLIOLE_REQUEST_SYNC_TRACE_ROOT;
  if (!root && !process.env.CI) return;
  const line = `${JSON.stringify({
    at: new Date().toISOString(), pid: process.pid, stage, event,
    ...(error === undefined ? {} : { error: error instanceof Error ? error.message : String(error) })
  })}\n`;
  if (root) appendFileSync(path.join(root, 'snapshot-stages.jsonl'), line);
  else process.stderr.write(line);
}

export async function snapshotStage<T>(stage: string, run: () => Promise<T>): Promise<T> {
  snapshotTrace(stage, 'start');
  try { const value = await run(); snapshotTrace(stage, 'end'); return value; }
  catch (error) { snapshotTrace(stage, 'error', error); throw error; }
}

export async function* snapshotStream<T>(stage: string, source: AsyncIterable<T>) {
  snapshotTrace(stage, 'start');
  try { yield* source; snapshotTrace(stage, 'end'); }
  catch (error) { snapshotTrace(stage, 'error', error); throw error; }
}

export function traceRequestClose(name: string, request: RequestSyncFiles) {
  if (!process.env.FOLIOLE_REQUEST_SYNC_TRACE_ROOT) return;
  const close = request.close.bind(request);
  request.close = () => snapshotStage(`${name}.close`, close);
}
