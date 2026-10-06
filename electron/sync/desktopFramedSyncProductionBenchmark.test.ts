// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  createDesktopFramedSyncProductionBenchmarkAdapter,
  runDesktopFramedSyncProductionBenchmark
} from './desktopFramedSyncProductionBenchmark.js';
import { readProductionBenchmarkDatabase } from './desktopFramedSyncProductionBenchmarkSqlite.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('interrupts an unfinished delivery discovered by the ordinary inventory round before receiver apply', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  const adapter = createDesktopFramedSyncProductionBenchmarkAdapter();
  try {
    await adapter.prepare({ fixture, itemCount: 4 });
    await adapter.stageUntilRestartBoundary({ fixture, itemCount: 4 });
    const pending = readProductionBenchmarkDatabase(fixture.rightSnapshot.databasePath);
    expect(pending.appliedItems).toBe(0);
    expect(pending.stagingRows.framed_sync_inbound_facts).toBeGreaterThan(0);
    expect(pending.stagingRows.framed_sync_receipts).toBe(0);
    expect(pending.readyTransferIds.length).toBeGreaterThan(0);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 60_000);

it('measures every requested item through the production process port and restart path', async () => {
  const outputPath = process.env.FOLIOLE_FRAMED_SYNC_BENCHMARK_OUTPUT;
  const reportPath = outputPath ?? path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-benchmark-report-')), 'report.json');
  const report = await runDesktopFramedSyncProductionBenchmark({
    ...(outputPath ? {} : { itemCounts: [4] }),
    outputPath: reportPath,
    measuredRuns: outputPath ? Number(process.env.FOLIOLE_FRAMED_SYNC_BENCHMARK_RUNS ?? 5) : 1,
    warmupRuns: 1
  });

  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  expect(report).toMatchObject({
    status: 'completed',
    verdict: 'inconclusive'
  });
  expect(report.warmupSamples.length).toBe(outputPath ? 3 : 1);
  const raw = (await fs.readFile(`${reportPath}.samples.jsonl`, 'utf8')).trim().split('\n');
  expect(raw.length).toBe(report.samples.length + report.warmupSamples.length);
  expect(raw[0]).toContain('"warmup":true');
  expect(raw.at(-1)).toContain('"warmup":false');
  for (const sample of report.samples) {
    expect(sample.status).toBe('completed');
    if (sample.status !== 'completed') continue;
    expect(sample.stageCounts.appliedItems).toBe(sample.itemCount);
    expect(sample.restartBoundary.appliedItems).toBe(0);
    expect(sample.restartBoundary.stagingRows.framed_sync_receipts).toBe(0);
    expect(sample.wire.sessionBytes).toBeGreaterThan(0);
    expect(sample.wire.transferBytes).toBeGreaterThan(0);
    expect(sample.wireBytes).toBe(sample.wire.sessionBytes + sample.wire.transferBytes);
  }
  if (!outputPath) await fs.rm(path.dirname(reportPath), { recursive: true, force: true });
}, 5_400_000);
