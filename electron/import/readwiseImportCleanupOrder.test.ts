// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-cleanup-order-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { replaceNodeOrder } from '../database/nodeMutations.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { previewReadwiseImportCleanup } from './readwiseImportCleanup.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-cleanup-order-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  saveImportManagerSettings({
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    },
    readwiseRootPath: path.join(tempRoot, 'readwise'),
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: path.join(tempRoot, 'readwise', 'Articles'),
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles')
      }
    ]
  });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(id: string, parentId: string | null, title: string, timestamp: string) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
       VALUES (?, ?, 'topic', ?, ?, ?, ?)`
    )
    .run(id, parentId, title, `# ${title}`, timestamp, timestamp);
}

function insertOrder(nodeIds: string[]) {
  const statement = openDatabaseConnection().sqlite
    .prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');
  nodeIds.forEach((nodeId, index) => statement.run(nodeId, index));
}

it('deletes unchanged Readwise imports after order persistence', () => {
  const importedAt = '2026-05-11T13:01:00.000Z';
  insertNode('node-readwise-root', null, 'Plain', importedAt);
  insertNode('node-readwise-child', 'node-readwise-root', 'Plain child', importedAt);
  insertNode('node-other', null, 'Other', importedAt);
  insertOrder(['node-readwise-root', 'node-readwise-child', 'node-other']);
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO keep_import_items (
        rule_id, source_path, source_mtime_ms, source_size_bytes, has_source_update,
        last_node_id, last_status, first_seen_at, last_seen_at, last_imported_at
      ) VALUES ('draft-import-source-1', 'Plain.md', 1, 1, 0, ?, 'imported', ?, ?, ?)`
    )
    .run('node-readwise-root', importedAt, importedAt, importedAt);

  replaceNodeOrder(['node-other', 'node-readwise-root', 'node-readwise-child']);

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 1,
    keep_count: 0,
    total_count: 1
  });
});

it('does not treat Readwise Books placeholders as changed after order persistence', () => {
  const importedAt = '2026-05-11T13:01:00.000Z';
  insertNode('node-readwise-book-placeholder', 'special-inbox', 'Readwise Book', importedAt);
  insertOrder(['node-readwise-book-placeholder']);

  replaceNodeOrder(['node-readwise-book-placeholder']);

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 1,
    keep_count: 0,
    total_count: 1
  });
  openDatabaseConnection().sqlite
    .prepare('UPDATE nodes SET title = ?, updated_at = ? WHERE id = ?')
    .run('Readwise Book edited', '2026-05-11T13:01:02.000Z', 'node-readwise-book-placeholder');
  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 0,
    keep_count: 1,
    total_count: 1
  });
});
