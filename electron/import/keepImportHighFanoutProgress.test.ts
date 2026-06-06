// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-keep-import-high-fanout-tests';
const { notifyManagedInboxUpdated } = vi.hoisted(() => ({
  notifyManagedInboxUpdated: vi.fn()
}));
const { runPreparedImportInWorkerWithSignal } = vi.hoisted(() => ({
  runPreparedImportInWorkerWithSignal: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated
}));

vi.mock('./keepImportPreparedImportWorkerClient.js', () => ({
  runPreparedImportInWorkerWithSignal
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';

import type { KeepImportProgressEvent } from './keepImportProgress.js';
import { saveReadwiseKeepImportSettings } from './keepImportReadwiseTestSupport.js';
import { runKeepImportRule } from './keepImportService.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-keep-import-high-fanout-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  runPreparedImportInWorkerWithSignal.mockImplementation(async ({ prepared }) => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    return runPreparedImport(prepared);
  });
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  notifyManagedInboxUpdated.mockReset();
  runPreparedImportInWorkerWithSignal.mockReset();
});

async function seedHighFanoutFixture(highlightCount: number) {
  const fullDocumentDir = path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles');
  const highlightDir = path.join(tempRoot, 'readwise', 'Articles');
  const highlights = Array.from({ length: highlightCount }, (_, index) => `Highlight passage ${index + 1}.`);
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(
    path.join(fullDocumentDir, 'High Fanout.md'),
    ['## Metadata', '- Author: Reader', '', '## Full Document', highlights.join(' ')].join('\n'),
    'utf8'
  );
  await fs.writeFile(
    path.join(highlightDir, 'High Fanout.md'),
    ['# High Fanout', '', '## Highlights', highlights.join('\n\n')].join('\n'),
    'utf8'
  );
  return { fullDocumentDir, highlightDir, readwiseRoot: path.join(tempRoot, 'readwise') };
}

function expectHighFanoutProgress(progressEvents: KeepImportProgressEvent[]) {
  expect(progressEvents).toContainEqual(
    expect.objectContaining({
      currentSourcePath: 'High Fanout.md',
      phase: 'scanning',
      sourceProcessedCount: 0,
      sourceTotalCount: 1
    })
  );
  expect(progressEvents).toContainEqual(
    expect.objectContaining({
      currentSourcePath: 'High Fanout.md',
      highlightProcessedCount: 0,
      highlightTotalCount: 305,
      phase: 'writing'
    })
  );
  expect(progressEvents).toContainEqual(
    expect.objectContaining({
      currentSourcePath: 'High Fanout.md',
      importWriteElapsedMs: expect.any(Number),
      highlightProcessedCount: 305,
      highlightTotalCount: 305,
      phase: 'writing'
    })
  );
  expect(progressEvents).toContainEqual(
    expect.objectContaining({
      currentSourcePath: 'High Fanout.md',
      indexElapsedMs: expect.any(Number),
      indexProcessedCount: 0,
      indexTotalCount: 306,
      phase: 'indexing'
    })
  );
  expect(progressEvents).toContainEqual(
    expect.objectContaining({
      currentSourcePath: 'High Fanout.md',
      indexElapsedMs: expect.any(Number),
      indexFailedCount: 0,
      indexPendingCount: 0,
      indexProcessedCount: 306,
      indexTotalCount: 306,
      phase: 'indexing'
    })
  );
  expect(progressEvents.at(-1)).toEqual(
    expect.objectContaining({
      currentSourcePath: 'High Fanout.md',
      phase: 'source_completed',
      sourceProcessedCount: 1,
      sourceTotalCount: 1
    })
  );
}

it('publishes source and highlight progress for high fanout Readwise imports', async () => {
  const fixture = await seedHighFanoutFixture(305);
  const progressEvents: KeepImportProgressEvent[] = [];
  saveReadwiseKeepImportSettings(fixture);

  let timerFired = false;
  const run = runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    onProgress: (event) => progressEvents.push(event),
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      timerFired = true;
      resolve();
    }, 0);
  });
  await run;

  const childCount = openDatabaseConnection().sqlite
    .prepare(
      `SELECT COUNT(*) AS count
       FROM nodes child
       JOIN import_sources source ON source.latest_node_id = child.parent_id
       WHERE source.source_name = 'High Fanout.md'`
    )
    .get() as { count: number };

  expect(runPreparedImportInWorkerWithSignal).toHaveBeenCalledTimes(1);
  expect(timerFired).toBe(true);
  expect(childCount.count).toBe(305);
  expect(openDatabaseConnection().sqlite
    .prepare('SELECT COUNT(*) AS count FROM search_index_invalidations WHERE status != ?')
    .get('completed')).toEqual({ count: 0 });
  expectHighFanoutProgress(progressEvents);
}, 20000);

it('marks the import degraded when search indexing fails after the write', async () => {
  const fixture = await seedHighFanoutFixture(2);
  const progressEvents: KeepImportProgressEvent[] = [];
  saveReadwiseKeepImportSettings(fixture);
  openDatabaseConnection().sqlite.exec('DROP TABLE node_search');

  await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    onProgress: (event) => progressEvents.push(event),
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  expect(openDatabaseConnection().sqlite
    .prepare('SELECT result_status, degraded_reason FROM import_runs WHERE source_name = ?')
    .get('High Fanout.md')).toEqual({
      degraded_reason: 'Search index update failed after import.',
      result_status: 'degraded'
    });
  expect(progressEvents).toContainEqual(
    expect.objectContaining({
      indexFailedCount: 3,
      phase: 'indexing'
    })
  );
});
