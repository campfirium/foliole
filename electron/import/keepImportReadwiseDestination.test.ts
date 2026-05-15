// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-destination-tests';

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
import { searchExternalDocuments } from '../database/externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import {
  loadExternalSearchBrowseEntries,
  loadExternalSearchPreview
} from '../database/externalSearchCacheRead.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes } from '../database/nodeMutations.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { runKeepImportRule } from './keepImportService.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-destination-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
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
  await fs.writeFile(path.join(fullDocumentDir, 'Plain.md'), '# Plain\n\nPlain body.\n', 'utf8');
  return { fullDocumentDir, highlightDir, readwiseRoot: path.join(tempRoot, 'readwise') };
}

function saveReadwiseSettings(
  paths: Awaited<ReturnType<typeof seedReadwiseFixture>>,
  behavior: { withHighlightsDestination: 'external' | 'inbox'; withoutHighlightsDestination: 'external' | 'inbox' | 'off' }
) {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      ...behavior,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z'
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

async function runReadwiseArticles() {
  await runKeepImportRule({
    directoryPath: path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles'),
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });
}

function readRows<T>(sql: string) {
  return openDatabaseConnection().sqlite.prepare(sql).all() as T[];
}

it('writes External destination files into the Readwise-managed external document index', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'external', withoutHighlightsDestination: 'off' });

  await runReadwiseArticles();

  expect(readRows('SELECT source_name FROM import_sources')).toEqual([]);
  expect(readRows('SELECT source_path FROM keep_import_items ORDER BY source_path ASC')).toEqual([
    { source_path: 'Highlighted.md' },
    { source_path: 'Plain.md' }
  ]);
  expect(readRows('SELECT document_id, folder_id, relative_path, is_present FROM external_documents ORDER BY document_id ASC')).toEqual([
    {
      document_id: 'readwise-reader-import-articles:Highlighted.md',
      folder_id: 'readwise-reader-import-articles',
      is_present: 1,
      relative_path: 'Highlighted.md'
    }
  ]);
  expect(readRows("SELECT object_id FROM sync_object_state WHERE object_type = 'external_document'")).toEqual([
    { object_id: 'readwise-reader-import-articles:Highlighted.md' }
  ]);
  const entries = loadExternalSearchBrowseEntries('readwise-reader-import-articles');
  expect(entries).toEqual([
    expect.objectContaining({
      absolute_path: path.join(fixture.fullDocumentDir, 'Highlighted.md'),
      folder_id: 'readwise-reader-import-articles',
      relative_path: 'Highlighted.md',
      title: 'Same Title'
    })
  ]);
  expect(searchExternalDocuments('Highlighted body').map((result) => result.id)).toContain(
    path.join(fixture.fullDocumentDir, 'Highlighted.md')
  );
  expect(loadExternalSearchPreview(path.join(fixture.fullDocumentDir, 'Highlighted.md'))).toEqual(expect.objectContaining({
    content: expect.stringContaining('Highlighted body.'),
    folder_id: 'readwise-reader-import-articles'
  }));
});

it('skips Off destination without creating Inbox or External rows', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'inbox', withoutHighlightsDestination: 'off' });
  await fs.rm(path.join(fixture.highlightDir, 'Highlighted.md'));

  await runReadwiseArticles();

  expect(readRows('SELECT source_name FROM import_sources')).toEqual([]);
  expect(readRows('SELECT document_id FROM external_documents')).toEqual([]);
  expect(readRows('SELECT source_path FROM keep_import_items ORDER BY source_path ASC')).toEqual([
    { source_path: 'Highlighted.md' },
    { source_path: 'Plain.md' }
  ]);
});

it('imports no-highlight sources into External after the behavior changes from Off', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, {
    withHighlightsDestination: 'inbox',
    withoutHighlightsDestination: 'off'
  });
  await fs.rm(path.join(fixture.highlightDir, 'Highlighted.md'));

  await runReadwiseReaderImport();
  expect(readRows('SELECT document_id FROM external_documents')).toEqual([]);

  saveReadwiseSettings(fixture, {
    withHighlightsDestination: 'inbox',
    withoutHighlightsDestination: 'external'
  });
  const result = await runReadwiseReaderImport();

  expect(result).toMatchObject({
    failed_count: 0,
    imported_count: 2,
    source_count: 1,
    status: 'completed'
  });
  expect(
    readRows('SELECT document_id, relative_path FROM external_documents ORDER BY relative_path ASC')
  ).toEqual([
    {
      document_id: 'readwise-reader-import-articles:Highlighted.md',
      relative_path: 'Highlighted.md'
    },
    {
      document_id: 'readwise-reader-import-articles:Plain.md',
      relative_path: 'Plain.md'
    }
  ]);
});

it('does not import Readwise sources when Reader is disabled', async () => {
  const fixture = await seedReadwiseFixture();
  saveImportManagerSettings({
    readwiseReaderConfig: {
      enabled: false,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z'
    },
    readwiseRootPath: fixture.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: fixture.highlightDir,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: fixture.fullDocumentDir
      }
    ]
  });

  const result = await runReadwiseReaderImport();

  expect(result).toMatchObject({
    imported_count: 0,
    source_count: 0,
    status: 'completed'
  });
  expect(readRows('SELECT source_name FROM import_sources')).toEqual([]);
  expect(readRows('SELECT source_path FROM keep_import_items')).toEqual([]);
});

it('imports a previously skipped no-highlight source after highlights appear', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'inbox', withoutHighlightsDestination: 'off' });
  await fs.rm(path.join(fixture.highlightDir, 'Highlighted.md'));

  await runReadwiseArticles();
  await fs.writeFile(path.join(fixture.highlightDir, 'Plain.md'), '# Plain\n\n## Highlights\nPlain body.\n', 'utf8');
  await runReadwiseArticles();

  expect(readRows('SELECT source_name FROM import_sources')).toEqual([{ source_name: 'Plain.md' }]);
  expect(readRows('SELECT source_path FROM keep_import_items ORDER BY source_path ASC')).toEqual([
    { source_path: 'Highlighted.md' },
    { source_path: 'Plain.md' }
  ]);
});

it('does not recreate a locally deleted Readwise Inbox topic during sync', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'inbox', withoutHighlightsDestination: 'off' });
  await runReadwiseReaderImport();
  const importedNode = openDatabaseConnection().sqlite
    .prepare(`SELECT last_node_id FROM keep_import_items WHERE source_path = 'Highlighted.md'`)
    .get() as { last_node_id: string };
  softDeleteNodes({
    deletedAt: '2026-05-12T00:00:00.000Z',
    nodeIds: [importedNode.last_node_id]
  });
  await fs.writeFile(path.join(fixture.fullDocumentDir, 'Highlighted.md'), '# Same Title\n\nChanged body.\n', 'utf8');

  const result = await runReadwiseReaderImport();
  const nodeRows = readRows<{ deleted_at: string | null; id: string }>(
    `SELECT id, deleted_at FROM nodes WHERE title = 'Same Title' ORDER BY created_at ASC`
  );
  const keepRows = readRows<{
    has_source_update: number;
    last_node_id: string;
    last_status: string;
    local_node_state: string;
    source_state: string;
  }>(
    `SELECT has_source_update, last_node_id, last_status, local_node_state, source_state
     FROM keep_import_items
     WHERE source_path = 'Highlighted.md'`
  );

  expect(result).toMatchObject({ imported_count: 0, skipped_count: 1 });
  expect(nodeRows).toEqual([{ deleted_at: '2026-05-12T00:00:00.000Z', id: importedNode.last_node_id }]);
  expect(keepRows).toEqual([
    {
      has_source_update: 1,
      last_node_id: importedNode.last_node_id,
      last_status: 'blocked_deleted',
      local_node_state: 'locally_deleted',
      source_state: 'present'
    }
  ]);
});

it('keeps Inbox destination on the existing duplicate title path', async () => {
  const fixture = await seedReadwiseFixture();
  await fs.writeFile(path.join(fixture.fullDocumentDir, 'Second.md'), '# Same Title\n\nSecond body.\n', 'utf8');
  await fs.writeFile(path.join(fixture.highlightDir, 'Second.md'), '# Same Title\n\n## Highlights\nSecond body.\n', 'utf8');
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'inbox', withoutHighlightsDestination: 'off' });

  await runReadwiseArticles();

  expect(readRows("SELECT title FROM nodes WHERE parent_id = 'special-inbox' AND title LIKE 'Same Title%' ORDER BY title ASC")).toEqual([{ title: 'Same Title' }, { title: 'Same Title 2' }]);
});
