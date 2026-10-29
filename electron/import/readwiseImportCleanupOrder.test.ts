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

import { rewriteExistingNodeOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { replaceNodeOrder } from '../database/nodeMutations.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { previewReadwiseImportCleanup, runReadwiseImportCleanup } from './readwiseImportCleanup.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-cleanup-order-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  await fs.mkdir(path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles'), { recursive: true });
  initializeDatabase();
  saveImportManagerSettings({
    readwiseAutoImportPolicy: {
      articleWithHighlights: 'inbox', articleWithoutHighlights: 'off',
      bookWithHighlights: 'inbox', bookWithoutHighlights: 'inbox', version: 1
    },
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z'
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
  vi.restoreAllMocks();
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
  rewriteExistingNodeOrder(openDatabaseConnection().driver, nodeIds);
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

function countUnrelatedStructureReads() {
  const db = openDatabaseConnection().sqlite;
  const prepare = db.prepare.bind(db);
  let reads = 0;
  let observedRows = 0;
  vi.spyOn(db, 'prepare').mockImplementation((sql) => {
    const statement = prepare(sql);
    if (sql === 'SELECT id, parent_id, title, anchor_link, created_at, updated_at FROM nodes WHERE deleted_at IS NULL') {
      const all = statement.all.bind(statement);
      vi.spyOn(statement, 'all').mockImplementation((...args: unknown[]) => all(...args).map((value) => {
        const row = value as { id: string; parent_id: string | null };
        if (row.id.startsWith('unrelated-')) {
          observedRows += 1;
          const parentId = row.parent_id;
          Object.defineProperty(row, 'parent_id', { get() { reads += 1; return parentId; } });
        }
        return row;
      }));
    }
    return statement;
  });
  return () => {
    expect(observedRows).toBeGreaterThan(0);
    return reads;
  };
}

it.each(['preview', 'run'])('bounds unrelated structure reads across multiple cleanup roots during %s', (operation) => {
  const at = '2026-05-11T13:01:00.000Z';
  const db = openDatabaseConnection().sqlite;
  for (let index = 0; index < 12; index += 1) {
    const id = `cleanup-root-${index}`;
    insertNode(id, null, id, at);
    if (index % 2 === 0) insertNode(`added-${index}`, id, 'User addition', '2026-05-11T13:01:02.000Z');
    db.prepare(`INSERT INTO keep_import_items (
      rule_id, source_path, source_mtime_ms, source_size_bytes, has_source_update,
      last_node_id, last_status, first_seen_at, last_seen_at, last_imported_at
    ) VALUES ('draft-import-source-1', ?, 1, 1, 0, ?, 'imported', ?, ?, ?)`)
      .run(`${id}.md`, id, at, at, at);
  }
  for (let index = 0; index < 100; index += 1) {
    insertNode(`unrelated-${index}`, null, 'Unrelated', at);
  }
  const readCount = countUnrelatedStructureReads();
  const result = operation === 'preview' ? previewReadwiseImportCleanup() : runReadwiseImportCleanup();
  expect(result).toMatchObject({ delete_count: 6, keep_count: 6, total_count: 12 });
  expect(result.entries.map((entry) => entry.node_id)).toEqual(
    Array.from({ length: 12 }, (_, index) => `cleanup-root-${index}`).sort());
  expect(readCount()).toBeLessThanOrEqual(100 * (operation === 'preview' ? 2 : 6));
  if (operation === 'run') {
    closeDatabaseConnection();
    expect(openDatabaseConnection().sqlite.prepare("SELECT id FROM nodes WHERE id LIKE 'cleanup-root-%' ORDER BY id").all()).toEqual(
      [0, 10, 2, 4, 6, 8].map((index) => ({ id: `cleanup-root-${index}` })));
    expect(openDatabaseConnection().sqlite.prepare("SELECT id FROM nodes WHERE id LIKE 'unrelated-%'").all()).toHaveLength(100);
  }
});

it('does not index unrelated structures when no cleanup roots are selected', () => {
  insertNode('unrelated-only', null, 'Other', '2026-05-11T13:01:00.000Z');
  const readCount = countUnrelatedStructureReads();
  expect(previewReadwiseImportCleanup()).toMatchObject({ total_count: 0 });
  expect(runReadwiseImportCleanup()).toMatchObject({ total_count: 0, status: 'completed' });
  expect(readCount()).toBe(0);
});
