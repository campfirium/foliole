// @vitest-environment node
import { expect, it, vi } from 'vitest';

vi.mock('node:worker_threads', async (original) => {
  const native = await original<typeof import('node:worker_threads')>();
  return { ...native, Worker: class extends native.Worker {
    constructor(url: URL, options: import('node:worker_threads').WorkerOptions) {
      super(new URL(url.href.replace(/\.js$/, '.ts')), { ...options,
        execArgv: ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-strip-types'] });
    }
  } };
});

import { longTextPdf } from '../database/longTextPdfTestFixture.js';

import { readReadwisePdfPages } from './readwisePdfPlacement.js';

const PAGE_COUNT = 400;

it('reads a long Readwise PDF for placement while the main thread keeps handling events', async () => {
  vi.stubEnv('VITEST', '');
  const bytes = Buffer.from(longTextPdf(PAGE_COUNT), 'latin1');
  let longestTurnGapMs = 0;
  let lastTurnAt = performance.now();
  let observing = true;
  const turn = () => {
    if (!observing) return;
    const now = performance.now();
    longestTurnGapMs = Math.max(longestTurnGapMs, now - lastTurnAt);
    lastTurnAt = now;
    setImmediate(turn);
  };
  setImmediate(turn);

  let pages: Awaited<ReturnType<typeof readReadwisePdfPages>>;
  try {
    pages = await readReadwisePdfPages(bytes);
    longestTurnGapMs = Math.max(longestTurnGapMs, performance.now() - lastTurnAt);
  } finally {
    observing = false;
    vi.unstubAllEnvs();
  }

  expect(pages).toHaveLength(PAGE_COUNT);
  expect(pages[PAGE_COUNT - 1]).toMatchObject({ geometrySupported: true, height: 792, page: PAGE_COUNT, width: 612 });
  expect(pages[PAGE_COUNT - 1]?.items[0]).toMatchObject({
    str: `Page ${PAGE_COUNT - 1} line 0 the quick brown fox jumps over the lazy dog`,
    transform: [9, 0, 0, 9, 40, 780]
  });
  expect(longestTurnGapMs).toBeLessThan(100);
}, 120_000);
