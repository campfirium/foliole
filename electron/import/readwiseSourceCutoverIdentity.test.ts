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
  loadReadwiseHostAssignment: () => ({ current_host_name: 'This Mac', is_active: true })
}));
vi.mock('./readwiseApiConnectionState.js', async () => {
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
  return { loadStoredReadwiseHostSettings: () => ({
    apiConnection: { secretRef: 'secret', state: 'connected' },
    readwiseReaderConfig: createDefaultReadwiseReaderConfig()
  }) };
});
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'secret' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { saveReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';

import { prepareReadwiseSourceCutoverIdentity } from './readwiseSourceCutoverIdentity.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-cutover-identity-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  state.sourcePath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(state.sourcePath, { recursive: true });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
  openDatabaseConnection().driver.execute(
    `INSERT OR REPLACE INTO settings (key,value,updated_at)
     VALUES ('readwise_source_mode','{"mode":"relay","version":1}','old')`
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('uses the bound legacy sidecar when V2 has no annotation body', async () => {
  await fs.writeFile(path.join(state.sourcePath, 'Sample.md'),
    '# Sample\n\n## Highlights\n- Legacy highlight ([View Highlight](https://read.readwise.io/read/highlight-v3))');
  seedLegacySource();
  openDatabaseConnection().driver.execute(
    `UPDATE import_sources SET remote_provider='readwise', remote_connection_ref='connection',
       remote_document_id='document-1' WHERE source_fingerprint='source-1'`
  );
  saveReadwiseApiCandidates('connection', [{
    destination: 'inbox', documentId: 'document-1', exportCategory: null,
    hasHighlights: true, highlightIds: ['highlight-v3'], noteIds: [],
    readerCategory: 'article', status: 'ready', title: 'Sample'
  }]);
  seedUnavailableAnnotationLedger();

  const identity = await prepareIdentity();
  expect(identity.bindingFor(document())).toMatchObject({
    legacyAnnotations: [{
      content: 'Legacy highlight', kind: 'highlight', parentRemoteId: 'document-1', remoteId: 'highlight-v3'
    }],
    nodeId: 'topic-1', remoteDocumentId: 'document-1', sourceFingerprint: 'source-1'
  });
});

it('treats duplicate identity artifacts for the same active Topic as one match', async () => {
  await fs.writeFile(path.join(state.sourcePath, 'Sample.md'),
    '# Sample\n\n[View Highlight](https://read.readwise.io/read/highlight-v3)');
  seedLegacySource();
  seedTrackedReadwiseRecord('topic-1', 'https://read.readwise.io/read/highlight-v3');
  saveCandidate();

  const identity = await prepareIdentity();
  expect(identity.bindingFor(document())).toMatchObject({ nodeId: 'topic-1' });
});

it('binds a legacy EPUB highlight whose source text is stored in its anchor', async () => {
  await fs.writeFile(path.join(state.sourcePath, 'Sample.md'),
    '# Sample\n\n## Highlights\n- Legacy highlight ([View Highlight](https://read.readwise.io/read/highlight-v3))');
  seedLegacySource();
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,anchor_link,created_at,updated_at)
    VALUES ('highlight-local','topic-1','topic','Legacy highlight',0,'',?,'old','old')`, [JSON.stringify({
    id: 'imported-highlight-local', kind: 'highlight',
    locator: { from: 0, originalText: 'Legacy highlight', to: 16 }
  })]);
  saveCandidate();
  const prepared = document();
  prepared.annotations = [{
    content: 'Legacy highlight', contentHash: 'hash', kind: 'highlight', locatorText: 'Legacy highlight',
    parentRemoteId: 'document-1', remoteId: 'highlight-v3', updatedAt: '2026-09-08T00:00:00.000Z'
  }];

  const identity = await prepareIdentity();
  expect(identity.bindingFor(prepared)).toMatchObject({
    annotations: [{ kind: 'highlight', nodeId: 'highlight-local', remoteId: 'highlight-v3' }]
  });
});

it('ignores stale identity artifacts whose Topic no longer exists', async () => {
  await fs.writeFile(path.join(state.sourcePath, 'Sample.md'),
    '# Sample\n\n[View Highlight](https://read.readwise.io/read/highlight-v3)');
  seedLegacySource();
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,source_locator,
    first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location) VALUES
    ('source-stale','desktop_text_file','markdown','Sample stale.md',?,'old','old','hash','missing-topic',
     'readwise:local','Sample.md')`, [path.join(state.sourcePath, 'Sample.md')]);
  saveCandidate();

  const identity = await prepareIdentity();
  expect(identity.bindingFor(document())).toMatchObject({ nodeId: 'topic-1' });
});

it('binds an EPUB through its tracked Readwise record after the Topic moves elsewhere', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('other-folder',NULL,'folder','Elsewhere',0,'','old','old'),
      ('moved-book','other-folder','topic','User title',0,'','old','old')`);
  seedTrackedReadwiseRecord('moved-book', 'https://read.readwise.io/read/document-1');
  const prepared = document();
  prepared.category = 'epub';
  prepared.metadata.category = 'epub';
  prepared.metadata.title = 'Legacy EPUB';
  prepared.title = 'Legacy EPUB';

  const identity = await prepareIdentity();

  expect(identity.bindingFor(prepared)).toMatchObject({
    legacyAnnotations: [], nodeId: 'moved-book', remoteDocumentId: 'document-1', sourceFingerprint: ''
  });
});

it('does not bind a same-title record that is not a Readwise source', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('user-topic',NULL,'topic','Legacy EPUB',0,'','old','old')`);
  seedTrackedReadwiseRecord('user-topic', 'https://read.readwise.io/read/document-1', 'watched');
  const prepared = document();
  prepared.category = 'epub';
  prepared.metadata.category = 'epub';
  prepared.metadata.title = 'Legacy EPUB';
  prepared.title = 'Legacy EPUB';

  const identity = await prepareIdentity();

  expect(identity.bindingFor(prepared)).toBeNull();
});

function seedTrackedReadwiseRecord(nodeId: string, content: string, sourceType = 'readwise') {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO desktop_sources (source_ref,source_type,config_ref,host_name,host_platform,
    root_path,path_flavor,type_settings_json,created_at,updated_at) VALUES
    ('tracked-source',?,'tracked-rule','This Mac','darwin','/unavailable','posix',?,'old','old')`,
  [sourceType, JSON.stringify({ highlightPath: '/unavailable', kind: 'books' })]);
  driver.execute(`INSERT INTO keep_import_items (
    rule_id,source_path,source_mtime_ms,source_size_bytes,source_state,local_node_state,
    has_source_update,last_node_id,last_status,first_seen_at,last_seen_at,last_imported_at
  ) VALUES ('tracked-rule','Legacy EPUB.md',1,1,'present','active',0,?,'imported','old','old','old')`, [nodeId]);
  driver.execute(`INSERT INTO keep_import_item_cache (
    rule_id,source_path,title,content,source_mtime_ms,source_size_bytes,refreshed_at
  ) VALUES ('tracked-rule','Legacy EPUB.md','Legacy EPUB',?,1,1,'old')`, [content]);
}

function prepareIdentity() {
  return prepareReadwiseSourceCutoverIdentity('connection', { fetchImpl: identityFetch(), minIntervalMs: 0 });
}

function identityFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const id = new URL(String(input)).searchParams.get('id');
    return Response.json({ results: [{
      category: id === 'highlight-v3' ? 'highlight' : 'article',
      id,
      parent_id: id === 'highlight-v3' ? 'document-1' : null
    }] });
  }) as typeof fetch;
}

function saveCandidate() {
  saveReadwiseApiCandidates('connection', [{
    destination: 'inbox', documentId: 'document-1', exportCategory: null,
    hasHighlights: true, highlightIds: ['highlight-v3'], noteIds: [],
    readerCategory: 'article', status: 'ready', title: 'Sample'
  }]);
}

function seedUnavailableAnnotationLedger() {
  openDatabaseConnection().driver.execute(
    `INSERT INTO readwise_api_import_stage (connection_ref,record_kind,remote_id,payload_json)
     VALUES ('connection','readwise-annotation-ledger-v3','highlight-v3',?)`,
    [JSON.stringify({
      category: 'highlight', contentStatus: 'unavailable', documentId: 'document-1',
      parentId: 'document-1', remoteId: 'highlight-v3', resolution: 'resolved',
      seenInRun: 'run', updatedAt: '2026-09-08T00:00:00.000Z'
    })]
  );
}

function seedLegacySource() {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('topic-1',NULL,'topic','Sample',0,'Legacy body','old','old')`);
  driver.execute(`INSERT INTO desktop_sources (source_ref,source_type,config_ref,host_name,host_platform,
    root_path,path_flavor,type_settings_json,created_at,updated_at) VALUES
    ('readwise:local','readwise','articles-local','This Mac','darwin',?,'posix',?,'old','old')`,
  [state.sourcePath, JSON.stringify({ highlightPath: state.sourcePath, kind: 'articles' })]);
  driver.execute(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,source_locator,
    first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location) VALUES
    ('source-1','desktop_text_file','markdown','Sample.md',?,'old','old','hash','topic-1','readwise:local','Sample.md')`,
  [path.join(state.sourcePath, 'Sample.md')]);
}

function document(): PreparedReadwiseApiDocument {
  return {
    annotations: [], body: '# API body', category: 'article', coverImageUrl: null,
    createdAt: '2026-09-08T00:00:00.000Z', degradedReason: null, epubStructure: null,
    id: 'document-1', metadata: {
      author: null, category: 'article', readerUrl: null, sourceUrl: null, title: 'Sample'
    },
    title: 'Sample', unmatchedAnnotationCount: 1, updatedAt: '2026-09-08T00:00:00.000Z'
  };
}
