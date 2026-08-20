// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-book-import-removed-tests';

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseDeviceAssignment.js', () => ({
  canCurrentDeviceRunReadwise: vi.fn(() => true)
}));

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { listRemovedKeepImportItems } from '../database/keepImportItems.js';
import { initializeDatabase } from '../database/migrate.js';
import { deleteNodesPermanently, softDeleteNodes } from '../database/nodeMutations.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { resetReadwiseBookImport } from './readwiseBookImportReset.js';
import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { runReadwiseBooksSource } from './readwiseReaderBooksRun.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-import-removed-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function importManualBookPlaceholder() {
  const highlightDir = path.join(tempRoot, 'Readwise', 'Books');
  const fullDocumentDir = path.join(tempRoot, 'Readwise', 'Full Document Contents', 'Books');
  const source = {
    actionMode: 'keep' as const,
    archivePath: '',
    highlightMode: 'split' as const,
    highlightPath: highlightDir,
    id: 'draft-import-source-books',
    keepPreview: null,
    keepState: 'enabled' as const,
    kind: 'books' as const,
    primaryPath: fullDocumentDir
  };
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.writeFile(path.join(highlightDir, 'Manual Book.md'), '# Manual Book\n\n## Highlights\nSaved quote.\n', 'utf8');
  await fs.writeFile(path.join(fullDocumentDir, 'Manual Book.md'), '# Manual Book\n\n## Full Document\nWaiting.\n', 'utf8');
  saveImportManagerSettings({
    readwiseReaderConfig: { enabled: true },
    readwiseSources: [source]
  });
  await runReadwiseBooksSource(source, {
    ...createDefaultReadwiseReaderConfig(),
    enabled: true,
    highlightsHeading: '## Highlights',
    importScope: 'highlights_only'
  });
}

it('moves permanently deleted readwise book nodes to Removed without recreating them', async () => {
  await importManualBookPlaceholder();
  const nodeId = buildReadwiseBookPlaceholderNodeId('manual book');
  softDeleteNodes({ deletedAt: '2026-04-04T11:00:00.000Z', nodeIds: [nodeId] });

  deleteNodesPermanently({ nodeIds: [nodeId], nodeOrder: [] });
  expect(listRemovedKeepImportItems()).toEqual([
    expect.objectContaining({
      last_node_id: nodeId,
      last_status: 'blocked_deleted',
      local_node_state: 'locally_deleted',
      rule_id: 'draft-import-source-books',
      source_path: 'Manual Book.md'
    })
  ]);

  const resetResult = await resetReadwiseBookImport(nodeId);
  expect(resetResult).toMatchObject({ node_id: null, status: 'book_not_found' });
  expect(openDatabaseConnection().sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get(nodeId)).toBeUndefined();
});

it('does not recreate soft-deleted readwise book nodes during later Books sync', async () => {
  await importManualBookPlaceholder();
  const nodeId = buildReadwiseBookPlaceholderNodeId('manual book');
  softDeleteNodes({ deletedAt: '2026-04-04T11:00:00.000Z', nodeIds: [nodeId] });

  await importManualBookPlaceholder();

  const rows = openDatabaseConnection().sqlite
    .prepare('SELECT id, deleted_at FROM nodes WHERE id = ?')
    .all(nodeId) as Array<{ deleted_at: string | null; id: string }>;
  expect(rows).toEqual([{ id: nodeId, deleted_at: '2026-04-04T11:00:00.000Z' }]);
  expect(
    openDatabaseConnection().sqlite
      .prepare('SELECT last_node_id, last_status, local_node_state FROM keep_import_items WHERE rule_id = ? AND source_path = ?')
      .get('draft-import-source-books', 'Manual Book.md')
  ).toEqual({
    last_node_id: nodeId,
    last_status: 'blocked_deleted',
    local_node_state: 'locally_deleted'
  });
});
