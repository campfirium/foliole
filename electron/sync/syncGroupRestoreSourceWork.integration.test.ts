// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_config_dir: path.join(appData, 'config'),
  app_cache_dir: path.join(appData, 'cache'), app_log_dir: path.join(appData, 'logs')
}) }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));

import { clearWorkgroupSyncDataForRestore } from '../../lib/core/sync/syncGroupRestoreReset.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { rebuildExternalSearchIndexes, refreshExternalSearchIndexes } from '../database/externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { saveExternalSearchFolders } from '../database/externalSearchFolders.js';
import { initializeDatabase } from '../database/migrate.js';
import { saveCurrentHostReadwiseSources } from '../database/readwiseSources.js';
import { upsertChangedWatchedFolderSource } from '../database/watchedFolderBindings.js';
import { runKeepImportRule } from '../import/keepImportService.js';

let root = '';
let sourcePath = '';
const original = '# Original source\nMust not return after overwrite.\n';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-overwrite-source-work-'));
  appData = path.join(root, 'app');
  sourcePath = path.join(root, 'source');
  await fs.mkdir(sourcePath);
  await fs.writeFile(path.join(sourcePath, 'entry.md'), original);
  await initializeDatabase();
});
afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

async function overwrite() {
  const db = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  await db.transaction(async (tx) => {
    await clearWorkgroupSyncDataForRestore(tx, 'source-work-overwrite');
    await tx.run(`INSERT INTO settings (key, value, updated_at)
      VALUES ('readwise_source_mode', '{"version":1,"mode":"relay"}', '2026-10-07T00:00:00.000Z')`);
  });
}

async function assertNoOldSourceContent() {
  const driver = openDatabaseConnection().driver;
  expect(driver.queryAll("SELECT id FROM nodes WHERE id NOT IN ('special-inbox', 'special-virtual-root')"))
    .toEqual([]);
  expect(driver.queryAll('SELECT * FROM import_sources')).toEqual([]);
  expect(driver.queryAll('SELECT * FROM external_documents')).toEqual([]);
  expect(driver.queryAll('SELECT * FROM desktop_sources')).toEqual([]);
  expect(await fs.readFile(path.join(sourcePath, 'entry.md'), 'utf8')).toBe(original);
}

function configureKeepSource(sourceType: 'generic' | 'readwise') {
  const source = { id: 'source-work', primaryPath: sourcePath,
    highlightPath: '', archivePath: '', highlightMode: 'merged', actionMode: 'keep',
    keepPreview: null, keepState: 'enabled' } as const;
  if (sourceType === 'generic') {
    upsertChangedWatchedFolderSource(source, '2026-10-07T00:00:00.000Z');
    return source.id;
  }
  return saveCurrentHostReadwiseSources([{ ...source, kind: 'articles' }],
    '2026-10-07T00:00:00.000Z')[0]!.id;
}

it.each(['generic', 'readwise'] as const)('does not finish an old %s import after its source configuration is cleared', async (sourceType) => {
  const ruleId = configureKeepSource(sourceType);
  let reset: Promise<void> | undefined;
  const result = await runKeepImportRule({ directoryPath: sourcePath, ruleId,
    sourceType, highlightPolicy: 'reference_only', onProgress: (event) => {
      if (event.phase === 'scanning' && !reset) reset = overwrite();
    } }).catch((error: unknown) => error);
  expect(reset).toBeDefined();
  await reset;
  if (sourceType === 'generic') {
    expect(result).toMatchObject({ message: 'source_not_owned_by_current_host' });
  } else {
    expect(result).toEqual([expect.objectContaining({ action: 'skipped', importStatus: null })]);
  }
  await assertNoOldSourceContent();
});

it.each(['scan', 'cache-write'] as const)('does not publish an external file after configuration is cleared during %s', async (phase) => {
  saveExternalSearchFolders([{ id: 'external-work', folder_path: sourcePath,
    attachment_mode: 'document_relative_first_then_fixed_root', attachment_root_path: null,
    excluded_dirs: [] }]);
  let cleared = false;
  let wroteCache = false;
  await refreshExternalSearchIndexes('external-work', { taskContext: {
    progress: (progress) => { wroteCache ||= progress.message === 'wrote external search upsert chunk'; },
    yieldIfNeeded: async () => {
      if (cleared || (phase === 'cache-write' && !wroteCache)) return;
      cleared = true;
      await overwrite();
    }
  } });
  expect(cleared).toBe(true);
  await assertNoOldSourceContent();
});

it('does not publish an external rebuild after its configuration is cleared', async () => {
  saveExternalSearchFolders([{ id: 'external-work', folder_path: sourcePath,
    attachment_mode: 'document_relative_first_then_fixed_root', attachment_root_path: null,
    excluded_dirs: [] }]);
  const rebuilding = rebuildExternalSearchIndexes('external-work');
  await overwrite();
  await rebuilding;
  await assertNoOldSourceContent();
});

it('imports a configured watched source normally when no overwrite occurs', async () => {
  const ruleId = configureKeepSource('generic');
  await runKeepImportRule({ directoryPath: sourcePath, ruleId,
    sourceType: 'generic', highlightPolicy: 'reference_only' });
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM import_sources')).toHaveLength(1);
  expect(await fs.readFile(path.join(sourcePath, 'entry.md'), 'utf8')).toBe(original);
});
