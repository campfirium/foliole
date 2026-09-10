// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('./managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: () => undefined }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(root, 'data'), app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes } from '../database/nodeMutations.js';

import { loadImportManagerSettings, saveImportManagerSettings } from './importManagerSettings.js';
import { saveReadwiseKeepImportSettings, seedReadwiseArticleFixture } from './keepImportReadwiseTestSupport.js';
import { runKeepImportRule } from './keepImportService.js';
import { importReadwiseManualSource } from './readwiseManualImport.js';
import { prepareReadwiseManualSearch, searchReadwiseManualSources } from './readwiseManualSearch.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-manual-folder-')); initializeDatabase(); });
afterEach(async () => { closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });

it.each(['off', 'external'] as const)('adopts a %s article through the original keep item and explicitly reimports deletion', async (destination) => {
  const fixture = await seedReadwiseArticleFixture(root);
  saveReadwiseKeepImportSettings(fixture);
  const settings = loadImportManagerSettings();
  saveImportManagerSettings({ ...settings, readwiseAutoImportPolicy: {
    ...settings.readwiseAutoImportPolicy, articleWithHighlights: destination
  } });
  await runKeepImportRule({ directoryPath: fixture.fullDocumentDir, ruleId: 'draft-import-source-1',
    sourceType: 'readwise', highlightPolicy: 'reference_only' });
  await prepareReadwiseManualSearch();
  expect(searchReadwiseManualSources('').sources).toEqual([]);
  const [source] = searchReadwiseManualSources('Someone').sources;
  expect(source?.status).toBe('available');
  const imported = await importReadwiseManualSource(source!.id, false);
  expect(imported.status).toBe('imported');
  expect(await importReadwiseManualSource(source!.id, false)).toEqual(imported);
  softDeleteNodes({ nodeIds: [imported.node_id!], deletedAt: '2026-09-10T00:00:00Z' });
  expect(searchReadwiseManualSources('Someone').sources[0]?.status).toBe('deleted');
  expect((await importReadwiseManualSource(source!.id, false)).status).toBe('reimport_required');
  expect((await importReadwiseManualSource(source!.id, true)).status).toBe('imported');
  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne('SELECT COUNT(*) count FROM keep_import_items')).toEqual({ count: 1 });
  expect(driver.queryOne('SELECT COUNT(*) count FROM external_documents WHERE is_present=1')).toEqual({ count: 0 });
});

it.each(['off', 'external'] as const)('adopts a %s book without creating a second source identity', async (destination) => {
  const primaryPath = path.join(root, 'Readwise', 'Full Document Contents', 'Books');
  const highlightPath = path.join(root, 'Readwise', 'Books');
  await fs.mkdir(primaryPath, { recursive: true });
  await fs.mkdir(highlightPath, { recursive: true });
  await fs.writeFile(path.join(primaryPath, 'Book.md'), '# Book\n## Metadata\n- Author: Writer\n## Full Document\nBook body');
  const settings = loadImportManagerSettings();
  saveImportManagerSettings({ ...settings, readwiseRootPath: path.join(root, 'Readwise'),
    readwiseAutoImportPolicy: { ...settings.readwiseAutoImportPolicy, bookWithoutHighlights: destination },
    readwiseReaderConfig: { ...settings.readwiseReaderConfig, enabled: true, validatedAt: '2026-09-10T00:00:00Z' },
    readwiseSources: [{ id: 'books', kind: 'books', primaryPath, highlightPath, keepState: 'enabled', highlightMode: 'split' }]
  });
  await runReadwiseReaderImport();
  await prepareReadwiseManualSearch();
  const [source] = searchReadwiseManualSources('Writer').sources;
  expect(source).toMatchObject({ status: 'available', kind: 'book' });
  const imported = await importReadwiseManualSource(source!.id, false);
  expect(imported.status).toBe('imported');
  await runReadwiseReaderImport();
  expect(searchReadwiseManualSources('Writer').sources[0]?.status).toBe('imported');
  expect(openDatabaseConnection().driver.queryOne('SELECT COUNT(*) count FROM external_documents WHERE is_present=1')).toEqual({ count: 0 });
});

it('imports a highlight-only book through the inventory and explicitly restores its deleted placeholder', async () => {
  const primaryPath = path.join(root, 'Readwise', 'Full Document Contents', 'Books');
  const highlightPath = path.join(root, 'Readwise', 'Books');
  await fs.mkdir(primaryPath, { recursive: true });
  await fs.mkdir(highlightPath, { recursive: true });
  await fs.writeFile(path.join(highlightPath, 'Sidecar.md'), '# Sidecar\n## Metadata\n- Author: Writer\n## Highlights\n- A quote.');
  const settings = loadImportManagerSettings();
  saveImportManagerSettings({ ...settings, readwiseRootPath: path.join(root, 'Readwise'),
    readwiseReaderConfig: { ...settings.readwiseReaderConfig, enabled: true, validatedAt: '2026-09-10T00:00:00Z' },
    readwiseSources: [{ id: 'books', kind: 'books', primaryPath, highlightPath, keepState: 'enabled', highlightMode: 'split' }]
  });
  await prepareReadwiseManualSearch();
  const source = searchReadwiseManualSources('Sidecar').sources[0]!;
  const imported = await importReadwiseManualSource(source.id, false);
  expect(imported.status).toBe('imported');
  softDeleteNodes({ nodeIds: [imported.node_id!], deletedAt: '2026-09-10T02:00:00Z' });
  expect((await importReadwiseManualSource(source.id, false)).status).toBe('reimport_required');
  expect((await importReadwiseManualSource(source.id, true)).status).toBe('imported');
  expect(openDatabaseConnection().driver.queryOne('SELECT COUNT(*) count FROM keep_import_items')).toEqual({ count: 1 });
});
