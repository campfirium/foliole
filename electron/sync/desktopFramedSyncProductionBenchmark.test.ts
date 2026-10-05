// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  runDesktopFramedSyncProductionBenchmark
} from './desktopFramedSyncProductionBenchmark.js';

it('measures every requested item through the production process port and restart path', async () => {
  const outputPath = process.env.FOLIOLE_FRAMED_SYNC_BENCHMARK_OUTPUT;
  const report = await runDesktopFramedSyncProductionBenchmark({
    ...(outputPath ? {} : { itemCounts: [4] }),
    measuredRuns: outputPath ? Number(process.env.FOLIOLE_FRAMED_SYNC_BENCHMARK_RUNS ?? 5) : 1,
    warmupRuns: outputPath ? 1 : 0
  });

  expect(report).toMatchObject({
    status: 'completed',
    verdict: 'inconclusive'
  });
  for (const sample of report.samples) expect(sample).toMatchObject({
    stageCounts: sample.status === 'completed' ? {
      appliedItems: sample.itemCount,
      authenticatedFrames: sample.itemCount * 4,
      availableBlobs: sample.itemCount,
      outboundFrames: sample.itemCount * 4,
      publishedFacts: sample.itemCount,
      receipts: sample.itemCount,
      stagedFacts: sample.itemCount
    } : undefined,
    status: 'completed'
  });
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
}, 2_700_000);
