// @vitest-environment node
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setInterval, clearInterval } from 'node:timers';

import { expect, test } from 'vitest';

import { parseBenchmarkOptions } from './fixed-performance-summary.mjs';

await import('./fixed-performance-http-boundary.mjs');
const { assertBody, assertHealthy, graph } = await import('../sync/simulator/assertions.ts');
const { edit, resetOperations } = await import('../sync/simulator/operations.ts');
const { openPeer, pairPeers } = await import('../sync/simulator/peers.ts');
const { converge } = await import('../sync/simulator/scenarios.ts');
const { pull, serve } = await import('../sync/simulator/transport.ts');

const options = parseBenchmarkOptions([process.env.FOLIOLE_BENCHMARK_MODE ?? 'core']);
const output = path.resolve(process.env.FOLIOLE_BENCHMARK_OUTPUT ?? `.tmp/artifacts/t285-http-${Date.now()}`);
const relativeOutput = path.relative(path.resolve('.tmp/artifacts'), output);
if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
  throw new Error('Benchmark output must be a fresh directory within .tmp/artifacts');
}
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);

async function measure(endpoint, receiver) {
  const before = receiver.sqlite.prepare('SELECT total_changes() AS count').get().count;
  const startRequest = endpoint.requests.length;
  let peakRss = process.memoryUsage().rss;
  const timer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 50);
  const started = performance.now();
  try {
    await pull(endpoint, receiver);
    return { durationMs: performance.now() - started,
      sqliteChangedRows: receiver.sqlite.prepare('SELECT total_changes() AS count').get().count - before,
      requests: endpoint.requests.slice(startRequest), sampledPeakProcessRss: Math.max(peakRss, process.memoryUsage().rss) };
  } finally { clearInterval(timer); }
}

async function round(size, sample, evidence) {
  const root = path.join(output, `${size}-${sample}`);
  await mkdir(root);
  resetOperations();
  process.env.FOLIOLE_SIM_PATH = 'desktop';
  process.env.FOLIOLE_SIM_SCENARIO = 'fixed-performance';
  process.env.FOLIOLE_SIM_SEED = '285';
  const a = openPeer(root, 'a', '285');
  const b = openPeer(root, 'b', '285');
  let sa;
  let sb;
  try {
    for (let index = 0; index < size; index++) edit(a, `Article ${index}\n${'Fixed body text.\n'.repeat(250)}`,
      `bench-${index}`, { title: `Article ${index}` });
    pairPeers([a, b]);
    sa = await serve(a);
    sb = await serve(b);
    evidence.first = await measure(sa, b);
    for (let index = 0; index < size; index++) assertBody(b,
      `Article ${index}\n${'Fixed body text.\n'.repeat(250)}`, `bench-${index}`);
    await converge({ a, b, sa, sb });
    const before = graph(b);
    const sequence = b.sqlite.prepare('SELECT * FROM sync_state_sequence').all();
    evidence.unchanged = await measure(sa, b);
    expect(graph(b)).toEqual(before);
    expect(b.sqlite.prepare('SELECT * FROM sync_state_sequence').all()).toEqual(sequence);
    expect(evidence.unchanged.requests.filter((route) =>
      /^\/companion\/(content-blobs|attachment-resource)(\?|$)/.test(route))).toEqual([]);
    assertHealthy(a);
    assertHealthy(b);
    evidence.correct = true;
  } finally {
    await sa?.close();
    await sb?.close();
    a.sqlite.close();
    b.sqlite.close();
  }
}

for (const size of options.sizes) test(`fixed loopback HTTP sync at ${size} articles`, async () => {
  const evidence = { size, repeats: options.repeats, boundary: 'production desktop receive; loopback HTTP; synthetic text only',
    samples: [], completed: false };
  try {
    for (let sample = 0; sample < options.repeats; sample++) {
      const result = { sample, correct: false };
      evidence.samples.push(result);
      await round(size, sample, result);
    }
    evidence.completed = true;
  } catch (error) { evidence.failure = String(error); throw error; }
  finally { await writeFile(path.join(output, `http-${size}.json`), JSON.stringify(evidence, null, 2)); }
}, Math.max(240_000, size * 200));
