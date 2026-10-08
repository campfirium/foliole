// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let directory = '';
let workerExit: Promise<void> | undefined;
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: directory,
  app_cache_dir: path.join(directory, 'cache'), app_config_dir: path.join(directory, 'config'),
  app_log_dir: path.join(directory, 'logs') }) }));
vi.mock('node:worker_threads', async (original) => {
  const native = await original<typeof import('node:worker_threads')>();
  return { ...native, Worker: class extends native.Worker {
    constructor(_url: URL, options: import('node:worker_threads').WorkerOptions) {
      super(new URL('./keepImportPreparedImportWorker.ts', import.meta.url), { ...options,
        execArgv: ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-transform-types'] });
      workerExit = new Promise((resolve) => { this.once('exit', () => resolve()); });
    }
  } };
});

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import type { PreparedImportRecord } from '../../lib/core/import/contract.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { runPreparedImportInWorkerWithSignal } from './keepImportPreparedImportWorkerClient.js';

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-worker-'));
  await initializeDatabase(undefined, { deferSearchIndex: true, recovery: 'fail' });
});
afterEach(async () => {
  await workerExit;
  workerExit = undefined;
  closeDatabaseConnection();
  await fs.rm(directory, { recursive: true, force: true });
});

async function importInWorker(prepared: PreparedImportRecord) {
  try {
    return await runWithDatabaseConnectionOwner(() => runPreparedImportInWorkerWithSignal({ prepared }));
  } finally {
    await workerExit;
  }
}

it('persists complete owned bodies and 300 highlights in a real worker', async () => {
  const connection = openDatabaseConnection();
  const matchedHighlights = Array.from({ length: 300 }, (_, i) => ({ content: `Sentence ${i}.`, label: null }));
  const content = '\ufeff中😀\0\n' + matchedHighlights.map((h) => h.content).join('\n') + '\nSentence 300.';
  const prepared: PreparedImportRecord = { content, contentFingerprint: 'first', degradedReason: null,
    importedAt: '2026-10-08T00:00:00.000Z', nodeTitle: 'Worker import', hideTitleHeading: false,
    provider: 'desktop_text_file', sourceFingerprint: 'worker-source', sourceKind: 'markdown',
    sourceLocator: '/isolated/article.md', sourceName: 'article.md', sourceProfile: 'body_with_highlight_sidecar', matchedHighlights };
  const imported = await importInWorker(prepared);
  if (!imported.nodeId) throw new Error('import_node_missing');
  const nodeId = imported.nodeId;
  expect(imported).toMatchObject({ resultStatus: 'imported', duplicateSemantic: 'new' });
  expect(loadNodeBodyResolution(connection.driver, nodeId)).toMatchObject({ content });
  const children = connection.driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE parent_id = ?', [nodeId]);
  expect(children).toHaveLength(300);
  expect(children.map((child) => loadNodeBodyResolution(connection.driver, child.id)))
    .toEqual(expect.arrayContaining(matchedHighlights.map((h) => expect.objectContaining({ content: h.content }))));
  expect(await importInWorker(prepared)).toMatchObject({ nodeId, duplicateSemantic: 'duplicate' });
  const next = { ...prepared, content: 'Updated\n' + content, contentFingerprint: 'second',
    matchedHighlights: [...matchedHighlights, { content: 'Sentence 300.', label: null }] };
  expect(await importInWorker(next)).toMatchObject({ nodeId, duplicateSemantic: 'updated' });
  expect(loadNodeBodyResolution(connection.driver, nodeId)).toMatchObject({ content });
  const updatedChildren = connection.driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE parent_id = ?', [nodeId]);
  expect(updatedChildren).toHaveLength(301);
  expect(updatedChildren.map((child) => loadNodeBodyResolution(connection.driver, child.id)))
    .toContainEqual(expect.objectContaining({ content: 'Sentence 300.' }));
  expect(connection.driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id = ?', [nodeId])?.content)
    .toBe(content);
  expect(connection.driver.queryAll('SELECT * FROM content_blob_data')).toEqual([]);
  expect(connection.driver.queryAll('PRAGMA foreign_key_check')).toEqual([]);
}, 20_000);
