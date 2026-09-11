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
    readwiseReaderConfig: createDefaultReadwiseReaderConfig()
  }) };
});

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
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('uses the frozen V3 parent identity even when V2 has no annotation body', async () => {
  await fs.writeFile(path.join(state.sourcePath, 'Sample.md'),
    '# Sample\n\n[View Highlight](https://read.readwise.io/read/highlight-v3)');
  seedLegacySource();
  saveReadwiseApiCandidates('connection', [{
    destination: 'inbox', documentId: 'document-1', exportCategory: null,
    hasHighlights: true, highlightIds: ['highlight-v3'], noteIds: [],
    readerCategory: 'article', status: 'ready', title: 'Sample'
  }]);

  const identity = await prepareReadwiseSourceCutoverIdentity('connection');
  expect(identity.bindingFor(document())).toMatchObject({
    nodeId: 'topic-1', remoteDocumentId: 'document-1', sourceFingerprint: 'source-1'
  });
});

it('treats duplicate identity artifacts for the same active Topic as one match', async () => {
  await fs.writeFile(path.join(state.sourcePath, 'Sample.md'),
    '# Sample\n\n[View Highlight](https://read.readwise.io/read/highlight-v3)');
  seedLegacySource();
  seedBookInventory('topic-1', path.join(state.sourcePath, 'Sample.md'));
  saveCandidate();

  const identity = await prepareReadwiseSourceCutoverIdentity('connection');
  expect(identity.bindingFor(document())).toMatchObject({ nodeId: 'topic-1' });
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

  const identity = await prepareReadwiseSourceCutoverIdentity('connection');
  expect(identity.bindingFor(document())).toMatchObject({ nodeId: 'topic-1' });
});

function saveCandidate() {
  saveReadwiseApiCandidates('connection', [{
    destination: 'inbox', documentId: 'document-1', exportCategory: null,
    hasHighlights: true, highlightIds: ['highlight-v3'], noteIds: [],
    readerCategory: 'article', status: 'ready', title: 'Sample'
  }]);
}

function seedBookInventory(nodeId: string, markdownPath: string) {
  openDatabaseConnection().driver.execute(
    "INSERT INTO settings (key,value,updated_at) VALUES ('readwise_books_inventory_state',?, 'old')",
    [JSON.stringify({ inventories: { books: { books: [{
      fullDocumentMarkdownPath: markdownPath,
      generatedNodeId: nodeId,
      highlightMarkdownPath: markdownPath
    }] } } })]
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
