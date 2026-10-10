// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let onWorkerOnline: (() => void) | null = null;
vi.mock('node:worker_threads', async (original) => {
  const native = await original<typeof import('node:worker_threads')>();
  return { ...native, Worker: class extends native.Worker {
    constructor(_url: URL, options: import('node:worker_threads').WorkerOptions) {
      super(new URL('./legacyBodyCollectionWorker.ts', import.meta.url), { ...options,
        execArgv: ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-strip-types'] });
      this.once('online', () => onWorkerOnline?.());
    }
  } };
});
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';

import { runLegacyBodyCollectionBatch } from './legacyBodyCollectionBatch.js';
import { runLegacyBodyCollectionWorker } from './legacyBodyCollectionWorkerClient.js';
import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries, sync } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(async () => { onWorkerOnline = null; await closeLibraries(); });

it('collects retired shared cache in real workers while two instances preserve owned bodies', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  source.db.pragma('journal_mode = WAL');
  target.db.pragma('journal_mode = WAL');
  joinPeers(source, target);
  const oldVersion = edit(source, 'Initial fact');
  await sync(source, target);
  for (const peer of [source, target]) peer.db.prepare('INSERT INTO node_version_local_holds VALUES (?, ?, ?, ?)')
    .run('retained-history', 'topic', oldVersion, 'now');
  const soonHeld = upsertTextBodyBlob(source.driver, 'Saved while worker is starting', 'now');
  const garbage = upsertTextBodyBlob(source.driver, 'Garbage fixture', 'now');
  let saved!: () => void;
  const savedDuringWorker = new Promise<void>((resolve) => { saved = resolve; });
  onWorkerOnline = () => { edit(source, 'Saved while worker is starting'); onWorkerOnline = null; saved(); };
  const collection = runLegacyBodyCollectionWorker(source.file, 32, new AbortController().signal);
  await savedDuringWorker;
  await sync(source, target);
  await collection;
  let result = await runLegacyBodyCollectionWorker(source.file, 32, new AbortController().signal);
  while (!result.completed) result = await runLegacyBodyCollectionWorker(source.file, 32, new AbortController().signal);
  while (!runLegacyBodyCollectionBatch({ driver: target.driver, sqlite: target.db }, 32).completed) { /* target batches */ }
  assertPersisted(source, 'Saved while worker is starting');
  assertPersisted(target, 'Saved while worker is starting');
  expect(source.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(soonHeld)).toBeDefined();
  expect(source.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(garbage)).toBeUndefined();
  expect(history(source).some((row) => row.version_id === oldVersion)).toBe(true);
  expect(history(target).some((row) => row.version_id === oldVersion)).toBe(true);
});
