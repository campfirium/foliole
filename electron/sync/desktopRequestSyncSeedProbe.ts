import { spawn } from 'node:child_process';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setFlagsFromString } from 'node:v8';

import { snapshotTrace } from '../database/requestSyncSnapshot.trace.js';

import { seedLargeOverwriteFixture } from './desktopFramedSyncLargeOverwrite.fixture.js';

let stop: (() => void) | undefined;
let record: ((event: string) => void) | undefined;

function enabled() {
  return Boolean(process.env.CI || process.env.FOLIOLE_REQUEST_SYNC_TRACE_ROOT);
}

export function startRequestSyncSeedProbe() {
  if (!enabled()) return;
  stop?.();
  setFlagsFromString('--trace-gc');
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  let previous = performance.now();
  let previousCpu = process.cpuUsage();
  const samples: string[] = [];
  const sample = (event: string) => {
    const now = performance.now();
    const cpu = process.cpuUsage();
    samples.push(`${event}:${JSON.stringify({
      at: new Date().toISOString(),
      uptimeMs: process.uptime() * 1000, intervalMs: now - previous,
      cpuUserMs: (cpu.user - previousCpu.user) / 1000,
      cpuSystemMs: (cpu.system - previousCpu.system) / 1000,
      samples: histogram.count, maxDelayMs: histogram.count ? histogram.max / 1e6 : null,
      heapUsed: process.memoryUsage().heapUsed
    })}`);
    histogram.reset();
    previous = now;
    previousCpu = cpu;
  };
  record = sample;
  sample('start');
  sampleNativeSeedWindow();
  const timer = setInterval(() => sample('tick'), 100);
  timer.unref();
  stop = () => {
    sample('discovery_received');
    clearInterval(timer);
    histogram.disable();
    setFlagsFromString('--notrace-gc');
    stop = undefined;
    record = undefined;
    // Keep synchronous Windows pipe writes outside the measured request callback.
    setImmediate(() => {
      for (const entry of samples) snapshotTrace('fixture.seed_loop', entry);
    });
  };
}

function sampleNativeSeedWindow() {
  const root = process.env.FOLIOLE_REQUEST_SYNC_TRACE_ROOT;
  if (process.platform !== 'darwin' || !root || process.env.FOLIOLE_REQUEST_SYNC_NATIVE_SAMPLE !== '1') return;
  const child = spawn('/usr/bin/sample', [String(process.pid), '3', '-file',
    path.join(root, `seed-native-${process.pid}.txt`)], { stdio: 'ignore' });
  child.once('error', error => snapshotTrace('fixture.seed_native_sample', 'error', error));
  child.once('exit', code => snapshotTrace('fixture.seed_native_sample', `exit:${code}`));
}

export function recordRequestSyncConnection() { record?.('connection_callback'); }

export function finishRequestSyncSeedProbe() { stop?.(); }

export async function seedWithRequestSyncProbe() {
  const result = await seedLargeOverwriteFixture();
  startRequestSyncSeedProbe();
  snapshotTrace('fixture.seed_large_overwrite', 'end');
  return result;
}
