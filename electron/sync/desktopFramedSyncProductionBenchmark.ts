import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';

import {
  createDesktopFramedSyncProductionBenchmarkAdapter
} from './desktopFramedSyncProductionBenchmarkAdapter.js';
import { startRssSampling } from './desktopFramedSyncProductionBenchmarkRss.js';
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
  wireBytes(input: Readonly<{ fixture: Fixture; itemCount: ItemCount }>): Readonly<{
    sessionBytes: number; transferBytes: number
  }>;
}>;

type CompletedSample = Readonly<{
  startedAt: string;
  durationMs: number;
  itemCount: ItemCount;
  peakRssBytes: number;
  sampledProcessIds: readonly number[];
  backgroundLoad: readonly number[];
  restartRecoveryMs: number;
  discoveryAndStageMs: number;
  restartBoundary: ProductionBenchmarkDatabaseSnapshot;
  wire: ReturnType<DesktopFramedSyncProductionBenchmarkAdapter['wireBytes']>;
  stageCounts: ReturnType<typeof productionBenchmarkStageCounts>;
  stagingRows: Readonly<{
    receiver: ProductionBenchmarkDatabaseSnapshot['stagingRows'];
    sender: ProductionBenchmarkDatabaseSnapshot['stagingRows'];
  }>;
  status: 'completed';
  wireBytes: number;
}>;

type FailedSample = Readonly<{ error: string; itemCount: ItemCount; startedAt: string; status: 'failed' }>;
export type ProductionBenchmarkSample = CompletedSample | FailedSample;

export async function runDesktopFramedSyncProductionBenchmark(input: Readonly<{
  adapter?: DesktopFramedSyncProductionBenchmarkAdapter;
  itemCounts?: readonly number[];
  measuredRuns?: number;
  outputPath?: string;
  warmupRuns?: number;
}> = {}) {
  const adapter = input.adapter ?? createDesktopFramedSyncProductionBenchmarkAdapter();
  const itemCounts = input.itemCounts ?? PRODUCTION_BENCHMARK_ITEM_COUNTS;
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD']);
  const revision = stdout.trim();
  const environment = { coreCount: os.cpus().length, loadAverage: os.loadavg(), platform: process.platform };
  const methodology = {
    measuredRuns: input.measuredRuns ?? 5,
    rss: '20 ms external resident-set samples summed across both fixture processes',
    staging: 'row counts read from both real SQLite libraries after restart recovery',
    warmupRuns: input.warmupRuns ?? 1,
    wire: 'observed HTTP request and response body bytes, including inventory sessions, transfer replays and error responses; excludes HTTP headers and chunk framing'
  };
  const samples: ProductionBenchmarkSample[] = [];
  const warmupSamples: ProductionBenchmarkSample[] = [];
  const sampleFile = input.outputPath ? `${input.outputPath}.samples.jsonl` : null;
  if (sampleFile) {
    await fs.mkdir(path.dirname(sampleFile), { recursive: true });
    await fs.writeFile(sampleFile, '');
  }
  for (const itemCount of itemCounts) {
    for (let run = 0; run < methodology.warmupRuns + methodology.measuredRuns; run += 1) {
      const sample = await captureSample(adapter, itemCount);
      if (sampleFile) await fs.appendFile(sampleFile, `${JSON.stringify({
        environment, methodology, revision, run, sample, warmup: run < methodology.warmupRuns
      })}\n`);
      if (run < methodology.warmupRuns) warmupSamples.push(sample);
      if (run >= methodology.warmupRuns) samples.push(sample);
    }
  }
  const warmupFailures = warmupSamples.filter((sample) => sample.status === 'failed').length;
  return {
    environment,
    revision,
    methodology,
    samples,
    summaries: itemCounts.map((itemCount) => summarize(samples, itemCount)),
    status: warmupFailures > 0 || samples.some((sample) => sample.status === 'failed')
      ? 'failed' as const : 'completed' as const,
    verdict: 'inconclusive' as const,
    verdictReason: 'absolute cost baseline only; limiter profile is deliberately not part of reported runs',
    warmupFailures,
    warmupSamples
  };
}

async function captureSample(
  adapter: DesktopFramedSyncProductionBenchmarkAdapter,
  itemCount: ItemCount
): Promise<ProductionBenchmarkSample> {
  let fixture: Fixture | undefined;
  let rss: ReturnType<typeof startRssSampling> | undefined;
  const startedAt = new Date().toISOString();
  try {
    fixture = await createDesktopFramedSyncTwoProcessFixture();
    const activeFixture = fixture;
    await adapter.prepare({ fixture: activeFixture, itemCount });
    rss = startRssSampling(() => adapter.residentProcessIds({ fixture: activeFixture }));
    const startedMs = performance.now();
    await adapter.stageUntilRestartBoundary({ fixture, itemCount });
    const discoveryAndStageMs = performance.now() - startedMs;
    const beforeRestart = readProductionBenchmarkDatabase(fixture.rightSnapshot.databasePath);
    if (beforeRestart.readyTransferIds.length === 0 ||
        beforeRestart.appliedItems !== 0 || beforeRestart.stagingRows.framed_sync_receipts !== 0) throw new Error('restart_boundary_not_durable_or_already_applied');
    const restartStartedAt = performance.now();
    await adapter.restartReceiverAndRecover({ fixture, itemCount });
    const restartRecoveryMs = performance.now() - restartStartedAt;
    const { peakRssBytes, sampledProcessIds } = await rss.stop();
    const sender = readProductionBenchmarkDatabase(fixture.leftSnapshot.databasePath);
    const receiver = readProductionBenchmarkDatabase(fixture.rightSnapshot.databasePath);
    assertCompletedWork({ itemCount, receiver, sender });
    for (const id of beforeRestart.readyTransferIds) {
      if (!receiver.receiptIds.includes(id) || !sender.receiptIds.includes(id)) {
        throw new Error('production_benchmark_original_delivery_not_recovered');
      }
    }
    const wire = adapter.wireBytes({ fixture, itemCount });
    return {
      discoveryAndStageMs,
      restartBoundary: beforeRestart,
      wire,
      startedAt,
      durationMs: performance.now() - startedMs,
      itemCount,
      peakRssBytes,
      sampledProcessIds,
      backgroundLoad: os.loadavg(),
      restartRecoveryMs,
      stageCounts: productionBenchmarkStageCounts({ receiver, sender }),
      stagingRows: { receiver: receiver.stagingRows, sender: sender.stagingRows },
      status: 'completed',
      wireBytes: wire.sessionBytes + wire.transferBytes
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), itemCount, startedAt, status: 'failed' };
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
  if (counts.appliedItems !== input.itemCount ||
      counts.stagedFacts !== counts.publishedFacts ||
      counts.receipts !== input.sender.stagingRows.framed_sync_outbound_publications ||
      counts.availableBlobs < input.itemCount ||
      input.sender.pendingTransferIds.length || input.receiver.pendingTransferIds.length) {
    throw new Error('production_benchmark_work_incomplete');
  }
  for (const transfer of input.sender.publicationIds) {
    if (!input.sender.receiptIds.includes(transfer) || !input.receiver.receiptIds.includes(transfer)) {
      throw new Error('production_benchmark_receipt_missing');
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

async function closeFixture(fixture: Fixture) {
  await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
  await fs.rm(fixture.root, { force: true, recursive: true });
}
