import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

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
  const finish = monitorStageLoop(stage);
  const started = performance.now();
  let synchronousMs = 0;
  try {
    const pending = run();
    synchronousMs = performance.now() - started;
    const value = await pending;
    snapshotTrace(stage, 'end');
    return value;
  } catch (error) { snapshotTrace(stage, 'error', error); throw error; }
  finally { finish?.(synchronousMs); }
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

function monitorStageLoop(stage: string) {
  if (!process.env.CI && !process.env.FOLIOLE_REQUEST_SYNC_TRACE_ROOT) return;
  if (!['fixture.discovery.client', 'adoption.prepare', 'adoption.exchange',
    'continuation.setup', 'continuation.exchange', 'continuation.send', 'continuation.reconnect'].includes(stage)) return;
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  const started = performance.now();
  const utilization = performance.eventLoopUtilization();
  const cpu = process.cpuUsage();
  histogram.enable();
  return (synchronousMs: number) => {
    const finished = performance.now();
    const loop = performance.eventLoopUtilization(utilization);
    const used = process.cpuUsage(cpu);
    // Sample after the current turn so a stalled timer can update the histogram.
    // This observer does not delay the operation or change its timeout signal.
    setTimeout(() => {
      histogram.disable();
      snapshotTrace(stage, `event_loop:${JSON.stringify({
        elapsedMs: finished - started, synchronousMs, samples: histogram.count,
        maxDelayMs: histogram.count ? histogram.max / 1e6 : null,
        meanDelayMs: histogram.count ? histogram.mean / 1e6 : null,
        utilization: loop.utilization, cpuMs: (used.user + used.system) / 1000,
        captureLagMs: performance.now() - finished
      })}`);
    }, 20).unref();
  };
}
