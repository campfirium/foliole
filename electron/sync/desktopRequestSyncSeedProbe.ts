import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setFlagsFromString } from 'node:v8';

import { snapshotTrace } from '../database/requestSyncSnapshot.trace.js';

import { seedLargeOverwriteFixture } from './desktopFramedSyncLargeOverwrite.fixture.js';

let stop: (() => void) | undefined;

export function startRequestSyncSeedProbe() {
  if (!process.env.FOLIOLE_SQLITE_DIAGNOSTIC_ROOT) return;
  stop?.();
  setFlagsFromString('--trace-gc');
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  let previous = performance.now();
  const sample = (event: string) => {
    const now = performance.now();
    snapshotTrace('fixture.seed_loop', `${event}:${JSON.stringify({
      uptimeMs: process.uptime() * 1000, intervalMs: now - previous,
      samples: histogram.count, maxDelayMs: histogram.count ? histogram.max / 1e6 : null,
      heapUsed: process.memoryUsage().heapUsed
    })}`);
    histogram.reset();
    previous = now;
  };
  sample('start');
  const timer = setInterval(() => sample('tick'), 1000);
  timer.unref();
  stop = () => {
    sample('discovery_received');
    clearInterval(timer);
    histogram.disable();
    setFlagsFromString('--notrace-gc');
    stop = undefined;
  };
}

export function finishRequestSyncSeedProbe() { stop?.(); }

export async function seedWithRequestSyncProbe() {
  startRequestSyncSeedProbe();
  const result = await seedLargeOverwriteFixture();
  snapshotTrace('fixture.seed_large_overwrite', 'end');
  return result;
}
