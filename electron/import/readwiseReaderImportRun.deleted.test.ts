// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-deleted-import-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated: vi.fn()
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes } from '../database/nodeMutations.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-deleted-import-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedReadwiseFixture() {
  const fullDocumentDir = path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles');
  const highlightDir = path.join(tempRoot, 'readwise', 'Articles');
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(path.join(fullDocumentDir, 'Highlighted.md'), '# Same Title\n\nHighlighted body.\n', 'utf8');
  await fs.writeFile(path.join(highlightDir, 'Highlighted.md'), '# Same Title\n\n## Highlights\nHighlighted body.\n', 'utf8');
  return { fullDocumentDir, highlightDir, readwiseRoot: path.join(tempRoot, 'readwise') };
}

function saveReadwiseSettings(paths: Awaited<ReturnType<typeof seedReadwiseFixture>>) {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    },
    readwiseRootPath: paths.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: paths.highlightDir,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: paths.fullDocumentDir
      }
    ]
  });
}

function readRows<T>(sql: string) {
  return openDatabaseConnection().sqlite.prepare(sql).all() as T[];
}

it('blocks automatic Readwise Inbox topic recreation after local deletion during sync', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture);
  await runReadwiseReaderImport();
  const importedNode = openDatabaseConnection().sqlite
    .prepare(`SELECT last_node_id FROM keep_import_items WHERE source_path = 'Highlighted.md'`)
    .get() as { last_node_id: string };
  softDeleteNodes({ deletedAt: '2026-05-12T00:00:00.000Z', nodeIds: [importedNode.last_node_id] });
  await fs.writeFile(path.join(fixture.fullDocumentDir, 'Highlighted.md'), '# Same Title\n\nChanged body.\n', 'utf8');

  await runReadwiseReaderImport();
  const nodeRows = readRows<{ deleted_at: string | null; id: string }>(
    `SELECT id, deleted_at FROM nodes WHERE title = 'Same Title' ORDER BY created_at ASC`
  );
  const keepRows = readRows<{ has_source_update: number; last_node_id: string; last_status: string; local_node_state: string }>(
    `SELECT has_source_update, last_node_id, last_status, local_node_state FROM keep_import_items WHERE source_path = 'Highlighted.md'`
  );

  expect(nodeRows).toEqual([
    { deleted_at: '2026-05-12T00:00:00.000Z', id: importedNode.last_node_id }
  ]);
  expect(keepRows).toEqual([
    { has_source_update: 1, last_node_id: importedNode.last_node_id, last_status: 'blocked_deleted', local_node_state: 'locally_deleted' }
  ]);
});
