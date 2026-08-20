// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-book-import-reset-order-tests';

const sourceOwnerMock = vi.hoisted(() => ({
  canRunExternalSources: true
}));

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
  canCurrentDeviceRunReadwise: vi.fn(() => sourceOwnerMock.canRunExternalSources)
}));

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { resetReadwiseBookImport } from './readwiseBookImportReset.js';
import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { scanReadwiseBooksInventory } from './readwiseBooksInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-import-reset-order-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function scanManualBook() {
  const highlightDir = path.join(tempRoot, 'Readwise', 'Books');
  const fullDocumentDir = path.join(tempRoot, 'Readwise', 'Full Document Contents', 'Books');
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.writeFile(path.join(highlightDir, 'Manual Book.md'), '# Manual Book\n\n## Highlights\nSaved quote.\n', 'utf8');
  await fs.writeFile(path.join(fullDocumentDir, 'Manual Book.md'), '# Manual Book\n\n## Full Document\nWaiting.\n', 'utf8');
  await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
}

function seedManualBookPlaceholder() {
  const nodeId = buildReadwiseBookPlaceholderNodeId('manual book');
  upsertNodeSnapshot({
    anchorLink: null,
    content: '# Manual Book\n\nWaiting for EPUB.',
    createdAt: '2026-04-04T10:00:00.000Z',
    hideTitleHeading: false,
    isTitleManual: true,
    kind: 'topic',
    nodeId,
    openingText: null,
    parentNodeId: 'special-inbox',
    position: null,
    reveal: null,
    title: 'Manual Book',
    updatedAt: '2026-04-04T10:00:00.000Z'
  });
  return nodeId;
}

it('re-imports book placeholders without writing inbox topic order', async () => {
  await scanManualBook();
  const nodeId = seedManualBookPlaceholder();
  const connection = openDatabaseConnection().sqlite;
  connection
    .prepare(
      `INSERT INTO nodes (
         id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
         content, reveal, anchor_link, created_at, updated_at, deleted_at
       ) VALUES (?, ?, 'topic', NULL, NULL, ?, 1, 0, '', NULL, NULL, ?, ?, NULL)`
    )
    .run('node-existing-inbox-top', 'special-inbox', 'Older inbox node', '2026-04-04T11:00:00.000Z', '2026-04-04T11:00:00.000Z');
  connection.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)').run('node-existing-inbox-top', 5);

  await resetReadwiseBookImport(nodeId);

  expect(connection.prepare('SELECT node_id FROM node_order WHERE node_id = ?').get(nodeId)).toBeUndefined();
});
