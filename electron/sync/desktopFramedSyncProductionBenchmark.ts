import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';

import {
  createDesktopFramedSyncProductionBenchmarkAdapter
} from './desktopFramedSyncProductionBenchmarkAdapter.js';
import {
  productionBenchmarkStageCounts,
  readProductionBenchmarkDatabase,
  type ProductionBenchmarkDatabaseSnapshot
} from './desktopFramedSyncProductionBenchmarkSqlite.js';
import {
  createDesktopFramedSyncTwoProcessFixture
} from './desktopFramedSyncTwoProcess.testSupport.js';

const execFileAsync = promisify(execFile);
export const PRODUCTION_BENCHMARK_ITEM_COUNTS = [300, 1_000, 10_000] as const;
export const PRODUCTION_BENCHMARK_ADAPTER_EXPORT =
  'createDesktopFramedSyncProductionBenchmarkAdapter';
export { createDesktopFramedSyncProductionBenchmarkAdapter };

type Fixture = Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>;
type ItemCount = number;

export type DesktopFramedSyncProductionBenchmarkAdapter = Readonly<{
  prepare(input: Readonly<{ fixture: Fixture; itemCount: ItemCount }>): Promise<void>;
  residentProcessIds(input: Readonly<{ fixture: Fixture }>): readonly number[];
  restartReceiverAndRecover(input: Readonly<{ fixture: Fixture; itemCount: ItemCount }>): Promise<void>;
  stageUntilRestartBoundary(input: Readonly<{ fixture: Fixture; itemCount: ItemCount }>): Promise<void>;
}>;

type CompletedSample = Readonly<{
  durationMs: number;
  itemCount: ItemCount;
  peakRssBytes: number;
  restartRecoveryMs: number;
  stageCounts: ReturnType<typeof productionBenchmarkStageCounts>;
  stagingRows: Readonly<{
    receiver: ProductionBenchmarkDatabaseSnapshot['stagingRows'];
    sender: ProductionBenchmarkDatabaseSnapshot['stagingRows'];
  }>;
  status: 'completed';
  wireBytes: number;
}>;

type FailedSample = Readonly<{ error: string; itemCount: ItemCount; status: 'failed' }>;
export type ProductionBenchmarkSample = CompletedSample | FailedSample;

export async function runDesktopFramedSyncProductionBenchmark(input: Readonly<{
  adapter?: DesktopFramedSyncProductionBenchmarkAdapter;
  itemCounts?: readonly number[];
  measuredRuns?: number;
  warmupRuns?: number;
}> = {}) {
  const adapter = input.adapter ?? createDesktopFramedSyncProductionBenchmarkAdapter();
  const itemCounts = input.itemCounts ?? PRODUCTION_BENCHMARK_ITEM_COUNTS;
  const environment = { coreCount: os.cpus().length, loadAverage: os.loadavg(), platform: process.platform };
  const methodology = {
    measuredRuns: input.measuredRuns ?? 5,
    rss: '20 ms external resident-set samples summed across both fixture processes',
    staging: 'row counts read from both real SQLite libraries after restart recovery',
    warmupRuns: input.warmupRuns ?? 1,
    wire: 'persisted preamble + authenticated frame header + ciphertext bytes; excludes HTTP headers and chunk framing'
  };
  const samples: ProductionBenchmarkSample[] = [];
  let warmupFailures = 0;
  for (const itemCount of itemCounts) {
    for (let run = 0; run < methodology.warmupRuns + methodology.measuredRuns; run += 1) {
      const sample = await captureSample(adapter, itemCount);
      if (run < methodology.warmupRuns && sample.status === 'failed') warmupFailures += 1;
      if (run >= methodology.warmupRuns) samples.push(sample);
    }
  }
  return {
    environment,
    methodology,
    samples,
    summaries: itemCounts.map((itemCount) => summarize(samples, itemCount)),
    status: warmupFailures > 0 || samples.some((sample) => sample.status === 'failed')
      ? 'failed' as const : 'completed' as const,
    verdict: 'inconclusive' as const,
    verdictReason: 'absolute cost baseline only; limiter profile is deliberately not part of reported runs',
    warmupFailures
  };
}

async function captureSample(
  adapter: DesktopFramedSyncProductionBenchmarkAdapter,
  itemCount: ItemCount
): Promise<ProductionBenchmarkSample> {
  let fixture: Fixture | undefined;
  let rss: ReturnType<typeof startRssSampling> | undefined;
  try {
    fixture = await createDesktopFramedSyncTwoProcessFixture();
    const activeFixture = fixture;
    await adapter.prepare({ fixture: activeFixture, itemCount });
    rss = startRssSampling(() => adapter.residentProcessIds({ fixture: activeFixture }));
    const startedAt = performance.now();
    await adapter.stageUntilRestartBoundary({ fixture, itemCount });
    const beforeRestart = readProductionBenchmarkDatabase(fixture.rightSnapshot.databasePath);
    if (beforeRestart.stagingRows.framed_sync_inbound_facts === 0 ||
        beforeRestart.appliedItems >= itemCount) throw new Error('restart_boundary_not_durable_or_already_applied');
    const restartStartedAt = performance.now();
    await adapter.restartReceiverAndRecover({ fixture, itemCount });
    const restartRecoveryMs = performance.now() - restartStartedAt;
    const peakRssBytes = await rss.stop();
    const sender = readProductionBenchmarkDatabase(fixture.leftSnapshot.databasePath);
    const receiver = readProductionBenchmarkDatabase(fixture.rightSnapshot.databasePath);
    assertCompletedWork({ itemCount, receiver, sender });
    return {
      durationMs: performance.now() - startedAt,
      itemCount,
      peakRssBytes,
      restartRecoveryMs,
      stageCounts: productionBenchmarkStageCounts({ receiver, sender }),
      stagingRows: { receiver: receiver.stagingRows, sender: sender.stagingRows },
      status: 'completed',
      wireBytes: receiver.wireBytes + sender.wireBytes
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), itemCount, status: 'failed' };
  } finally {
    if (rss) await rss.stop().catch(() => undefined);
    if (fixture) await closeFixture(fixture);
  }
}

function assertCompletedWork(input: Readonly<{
  itemCount: number;
  receiver: ProductionBenchmarkDatabaseSnapshot;
  sender: ProductionBenchmarkDatabaseSnapshot;
}>) {
  const counts = productionBenchmarkStageCounts(input);
  const expected = {
    appliedItems: input.itemCount,
    authenticatedFrames: input.itemCount * 4,
    availableBlobs: input.itemCount,
    outboundFrames: input.itemCount * 4,
    publishedFacts: input.itemCount,
    receipts: input.itemCount,
    stagedFacts: input.itemCount
  };
  for (const [name, value] of Object.entries(expected)) {
    if (counts[name as keyof typeof counts] !== value) {
      throw new Error(`production_benchmark_work_count_mismatch:${name}:${
        counts[name as keyof typeof counts]}:${value}`);
    }
  }
}

function summarize(samples: readonly ProductionBenchmarkSample[], itemCount: ItemCount) {
  const matching = samples.filter((sample): sample is CompletedSample =>
    sample.itemCount === itemCount && sample.status === 'completed');
  const failedRuns = samples.filter((sample) =>
    sample.itemCount === itemCount && sample.status === 'failed').length;
  return {
    durationMs: spread(matching.map((sample) => sample.durationMs)),
    failedRuns,
    itemCount,
    peakRssBytes: spread(matching.map((sample) => sample.peakRssBytes)),
    restartRecoveryMs: spread(matching.map((sample) => sample.restartRecoveryMs)),
    successfulRuns: matching.length,
    wireBytes: spread(matching.map((sample) => sample.wireBytes))
  };
}

function spread(values: readonly number[]) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(ordered.length / 2);
  const upper = ordered.at(midpoint);
  const minimum = ordered.at(0);
  const maximum = ordered.at(-1);
  if (upper === undefined || minimum === undefined || maximum === undefined) return null;
  const lower = ordered.at(midpoint - 1);
  const median = ordered.length % 2 === 1 || lower === undefined ? upper : (lower + upper) / 2;
  return { maximum, median, minimum };
}

function startRssSampling(processIds: () => readonly number[]) {
  let active = true;
  let peakRssBytes = 0;
  const polling = (async () => {
    while (active) {
      peakRssBytes = Math.max(peakRssBytes, await sampleRssBytes(processIds()));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    peakRssBytes = Math.max(peakRssBytes, await sampleRssBytes(processIds()));
  })();
  return { async stop() { active = false; await polling; return peakRssBytes; } };
}

async function sampleRssBytes(pids: readonly number[]) {
  if (pids.length === 0) throw new Error('rss_process_ids_missing');
  const readings = await Promise.all(pids.map(async (pid) => {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync('ps', ['-o', 'rss=', '-p', String(pid)]));
    } catch (error) {
      if (isProcessGone(error)) return 0;
      throw error;
    }
    const kibibytes = Number(stdout.trim());
    if (!Number.isSafeInteger(kibibytes) || kibibytes < 0) throw new Error('rss_sample_invalid');
    return kibibytes * 1024;
  }));
  return readings.reduce((total, bytes) => total + bytes, 0);
}

function isProcessGone(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 1;
}

async function closeFixture(fixture: Fixture) {
  await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
  await fs.rm(fixture.root, { force: true, recursive: true });
}
