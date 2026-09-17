// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
const state = vi.hoisted(() => ({ sourcePath: '' }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
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
      readwiseReaderConfig: createDefaultReadwiseReaderConfig(), readwiseSourceMode: 'api'
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
import { epubMigrationFetch, seedMigratableSource } from './readwiseSourceCutoverTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-recovery-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  publishAttachmentLibraryPathSnapshot({
    assetsDir: path.join(mockedAppDataDir, 'assets'), libraryScope: 'test-library'
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

it('rebuilds a bound EPUB from frozen Reader HTML and keeps unlocated highlights last', async () => {
  await seedMigratableSource(state.sourcePath);
  const driver = openDatabaseConnection().driver;
  await fs.writeFile(path.join(state.sourcePath, 'Sample.md'), [
    '# Sample',
    'Full text of this document omitted because this document is an EPUB',
    '[Download original file →](https://readwise.io/reader/document_raw_content/33661889)'
  ].join('\n'));
  driver.execute("UPDATE nodes SET content='Original file missing' WHERE id='topic-1'");
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('node-epub-legacy','topic-1','topic','Legacy',0,'Legacy body','old','old')`);
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,anchor_link,created_at,updated_at)
    VALUES ('local-unlocated','topic-1','topic','Missing local text',0,'Missing local text',
      '{"id":"local-missing","kind":"highlight","locator":{"from":0,"to":18,"originalText":"Missing local text"}}','old','old')`);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  const fetchImpl = epubMigrationFetch();

  await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } }))
    .resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  expect(driver.queryAll<{ title: string }>(
    "SELECT title FROM nodes WHERE parent_id='topic-1' AND id LIKE 'node-epub-%' AND deleted_at IS NULL"
  ).map((item) => item.title)).toEqual(['Chapter 1', 'Chapter 2']);
  const source = driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id='document-1'"
  );
  expect(JSON.parse(source?.remote_import_state_json ?? '{}')).toMatchObject({
    bodyAuthority: 'reader_html', originalFile: null
  });
  expect(driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id='document-1'"
  )).toEqual({ latest_node_id: 'topic-1' });
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM nodes WHERE title='Sample' AND deleted_at IS NULL"
  )).toEqual({ count: 1 });
  expect(fetchImpl.mock.calls.filter(([input]) => new URL(String(input)).hostname.endsWith('.amazonaws.com')))
    .toHaveLength(0);
  expect(driver.queryAll<{ content: string }>(
    "SELECT content FROM nodes WHERE id='topic-1' OR parent_id='topic-1'"
  ).map((row) => row.content).join('\n')).toContain('https://bucket.s3.amazonaws.com/diagram.png');
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .toContain('https://bucket.s3.amazonaws.com/cover.jpeg');
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM node_attachments WHERE node_id='topic-1' OR node_id IN (SELECT id FROM nodes WHERE parent_id='topic-1')"
  )).toEqual({ count: 0 });
  expect(driver.queryOne<{ title: string }>(`SELECT parent.title FROM nodes child
    JOIN nodes parent ON parent.id=child.parent_id WHERE child.id='local-unlocated'`)).toEqual({ title: '※' });
  expect(driver.queryOne<{ title: string }>(`SELECT child.title FROM nodes child JOIN node_order o ON o.node_id=child.id
    WHERE child.parent_id='topic-1' AND child.deleted_at IS NULL ORDER BY o.position DESC LIMIT 1`))
    .toEqual({ title: '※' });
});

it('never requests the binary original while rebuilding a matched EPUB', async () => {
  await seedMigratableSource(state.sourcePath);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  const fallback = epubMigrationFetch();
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    return url.hostname.endsWith('.amazonaws.com')
      ? new Response(null, { status: 500 }) : fallback(input);
  });

  await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } }))
    .resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  const journal = JSON.parse(openDatabaseConnection().driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
  )?.value ?? '{}');
  expect(journal).toMatchObject({
    documents: [{ remoteId: 'document-1', status: 'bound' }], status: 'api'
  });
  expect(journal.failures ?? []).toEqual([]);
  expect(fetchImpl.mock.calls.filter(([input]) => new URL(String(input)).hostname.endsWith('.amazonaws.com')))
    .toHaveLength(0);
});

it('replaces a wrong migration original-file state with Reader HTML authority', async () => {
  await seedMigratableSource(state.sourcePath);
  const remote = ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  const driver = openDatabaseConnection().driver;
  driver.execute(`UPDATE import_sources SET remote_provider='readwise', remote_connection_ref=?,
    remote_document_id='document-1', remote_annotations_json='[]', remote_import_state_json=?
    WHERE source_fingerprint='source-1'`, [remote.connectionRef, JSON.stringify({
    annotations: [], bodyAuthority: 'original_epub', bodyState: 'materialized',
    documentBlockedAt: null, metadata: { category: 'epub' },
    originalFile: {
      attachmentId: 'wrong-original', contentHash: 'wrong-hash', mimeType: 'application/epub+zip',
      reason: null, sizeBytes: 10, status: 'localized'
    },
    remoteLifecycle: null, sourceUpdatedAt: null, sourceUpdate: null, version: 6
  })]);
  driver.execute(`INSERT INTO attachments (id,original_name,mime_type,size_bytes,created_at)
    VALUES ('wrong-original','wrong.epub','application/epub+zip',10,'old')`);
  driver.execute(`INSERT INTO node_attachments (node_id,attachment_id,role)
    VALUES ('topic-1','wrong-original','reference')`);

  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl: epubMigrationFetch(), minIntervalMs: 0 }
  })).resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  const source = driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id='document-1'"
  );
  expect(JSON.parse(source?.remote_import_state_json ?? '{}')).toMatchObject({
    bodyAuthority: 'reader_html', originalFile: null
  });
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM node_attachments WHERE attachment_id='wrong-original'"
  )).toEqual({ count: 0 });
  expect(driver.queryAll<{ title: string }>(
    "SELECT title FROM nodes WHERE parent_id='topic-1' AND id LIKE 'node-epub-%' AND deleted_at IS NULL"
  ).map((item) => item.title)).toEqual(['Chapter 1', 'Chapter 2']);
});
