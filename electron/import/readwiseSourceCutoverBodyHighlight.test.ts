// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
const state = vi.hoisted(() => ({ sourcePath: '' }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: () => true,
  loadReadwiseHostAssignment: () => ({ current_host_name: 'This Mac', is_active: true })
}));
vi.mock('./readwiseApiConnectionState.js', async () => {
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
  return {
    isStoredReadwiseApiConnectionReady: () => true,
    loadStoredReadwiseHostSettings: () => ({
      apiConnection: { secretRef: 'readwise-secret', state: 'connected' },
      readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
      readwiseSourceMode: 'api'
    })
  };
});
vi.mock('./importManagerSettings.js', async () => {
  const { createDefaultReadwiseAutoImportPolicy } = await import('../../lib/core/import/readwiseAutoImportPolicy.js');
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
  return { loadImportManagerSettings: () => ({
    readwiseAutoImportPolicy: createDefaultReadwiseAutoImportPolicy(),
    readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
    readwiseSources: [{
      highlightMode: 'split', highlightPath: state.sourcePath, id: 'local', keepState: 'enabled',
      kind: 'articles', primaryPath: state.sourcePath
    }]
  }) };
});
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'secret' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import {
  clearAttachmentLibraryPathSnapshot,
  publishAttachmentLibraryPathSnapshot
} from '../attachments/attachmentLibraryPathSnapshot.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { runReadwiseSourceCutover } from './readwiseSourceCutover.js';
import {
  epubMigrationFetch,
  migrationFetch,
  migrationFetchWithoutHighlightBody,
  seedMigratableSource
} from './readwiseSourceCutoverTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-body-highlight-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  publishAttachmentLibraryPathSnapshot({
    assetsDir: path.join(mockedAppDataDir, 'assets'),
    libraryScope: 'test-library'
  });
  state.sourcePath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(state.sourcePath, { recursive: true });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
  openDatabaseConnection().driver.execute(
    "INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('readwise_source_mode',?,'old')",
    [JSON.stringify({ mode: 'relay', version: 1 })]
  );
});

afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps the legacy body while materializing a fallback highlight', async () => {
  await seedMigratableSource(state.sourcePath);
  const seeded = openDatabaseConnection().driver;
  seeded.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('readwise-folder',NULL,'folder','Readwise Folder',0,'','old','old')`);
  seeded.execute("UPDATE nodes SET parent_id='readwise-folder' WHERE id='topic-1'");
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl: migrationFetchWithoutHighlightBody(), minIntervalMs: 0 }
  })).resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .toContain('Legacy body with remembered phrase.');
  expect(driver.queryOne<{ content: string }>(
    `SELECT content FROM nodes WHERE parent_id='topic-1' AND content='remembered phrase'`
  )?.content).toBe('remembered phrase');
  expect(driver.queryOne<{ anchor_link: string }>(
    "SELECT anchor_link FROM nodes WHERE id='local-cloze'"
  )?.anchor_link).toContain('remembered phrase');
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM nodes WHERE kind='topic' AND title LIKE 'Sample%' AND deleted_at IS NULL"
  )?.count).toBe(1);
  expect(driver.queryOne<{ parent_id: string }>("SELECT parent_id FROM nodes WHERE id='topic-1'")?.parent_id)
    .toBe('readwise-folder');
});

it('rebuilds a bound EPUB from its freshly downloaded original file', async () => {
  await seedMigratableSource(state.sourcePath);
  const seeded = openDatabaseConnection().driver;
  seeded.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('node-epub-legacy','topic-1','topic','Legacy',0,'Legacy body','old','old')`);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');

  const fetchImpl = epubMigrationFetch();
  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl, minIntervalMs: 0 }
  })).resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .not.toContain('Book import pending');
  expect(driver.queryAll<{ title: string }>(
    "SELECT title FROM nodes WHERE parent_id='topic-1' AND id LIKE 'node-epub-%' AND deleted_at IS NULL"
  ).map((item) => item.title)).toContain('Original chapter');
  const source = driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id='document-1'"
  );
  expect(JSON.parse(source?.remote_import_state_json ?? '{}')).toMatchObject({
    bodyAuthority: 'original_epub',
    originalFile: { status: 'localized' }
  });
  expect(fetchImpl.mock.calls.filter(([input]) => new URL(String(input)).hostname.endsWith('.amazonaws.com')))
    .toHaveLength(1);
});

it('uses the existing body while binding edited legacy highlights and importing later highlights', async () => {
  await seedMigratableSource(state.sourcePath);
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,anchor_link,created_at,updated_at)
    VALUES ('legacy-imported-highlight','topic-1','topic','remembered phrase',0,'',?,'old','old')`, [JSON.stringify({
    id: 'imported-highlight-legacy', kind: 'highlight',
    locator: { from: 17, originalText: 'remembered phrase', to: 34 }
  })]);
  const legacyHighlight = driver.queryOne<{ id: string }>(
    "SELECT id FROM nodes WHERE id='legacy-imported-highlight'"
  );
  expect(legacyHighlight).toBeTruthy();
  driver.execute("UPDATE nodes SET updated_at='newer' WHERE id=?", [legacyHighlight!.id]);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  const fallback = migrationFetch();
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v2/export/') {
      return Response.json({ nextPageCursor: null, results: [{
        external_id: 'document-1', source: 'reader', highlights: [
          { external_id: 'highlight-1', text: 'remembered phrase' },
          { external_id: 'highlight-2', text: 'new phrase' }
        ]
      }] });
    }
    if (!url.searchParams.get('id') && !url.searchParams.has('category')) {
      return Response.json({ count: 3, nextPageCursor: null, results: [{
        category: 'article', html_content: null, id: 'document-1', parent_id: null, title: 'Sample'
      }, {
        category: 'highlight', id: 'highlight-1', parent_id: 'document-1', title: 'Sample'
      }, {
        category: 'highlight', id: 'highlight-2', parent_id: 'document-1', title: 'Sample'
      }] });
    }
    return fallback(input);
  }) as typeof fetch;

  await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } }))
    .resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .toContain('Legacy body with remembered phrase.');
  expect(driver.queryOne<{ id: string }>(
    "SELECT id FROM nodes WHERE parent_id='topic-1' AND content='new phrase' AND deleted_at IS NULL"
  )).toBeTruthy();
  const source = driver.queryOne<{ remote_annotations_json: string }>(
    "SELECT remote_annotations_json FROM import_sources WHERE remote_document_id='document-1'"
  );
  const bindings = JSON.parse(source?.remote_annotations_json ?? '[]');
  expect(bindings).toContainEqual(expect.objectContaining({ nodeId: legacyHighlight!.id, remoteId: 'highlight-1' }));
  expect(bindings).toContainEqual(expect.objectContaining({ remoteId: 'highlight-2' }));
});

it('records a matched EPUB as failed instead of bound when its fresh download fails', async () => {
  await seedMigratableSource(state.sourcePath);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  const fallback = epubMigrationFetch();
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    return url.hostname.endsWith('.amazonaws.com')
      ? new Response(null, { status: 500 }) : fallback(input);
  }) as typeof fetch;

  await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } }))
    .resolves.toMatchObject({ migrated_count: 0, status: 'completed' });

  const journal = JSON.parse(openDatabaseConnection().driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
  )?.value ?? '{}');
  expect(journal).toMatchObject({
    documents: [{ remoteId: 'document-1', status: 'blocked' }],
    failures: [{ remoteId: 'document-1', stage: 'resources' }],
    status: 'api'
  });
});
