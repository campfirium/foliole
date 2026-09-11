// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
const state = vi.hoisted(() => ({ sourcePath: '' }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(tempRoot, 'cache'),
    app_config_dir: path.join(tempRoot, 'config'),
    app_data_dir: path.join(tempRoot, 'app-data'),
    app_log_dir: path.join(tempRoot, 'logs')
  })
}));
vi.mock('./importManagerSettings.js', async () => {
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
  return { loadImportManagerSettings: () => ({
    readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
    readwiseSources: [{
      highlightMode: 'split', highlightPath: state.sourcePath, id: 'local', keepState: 'enabled',
      kind: 'articles', primaryPath: state.sourcePath
    }]
  }) };
});
vi.mock('../attachments/remoteImagePipeline.js', () => ({
  fetchRemoteImageResource: vi.fn(async (sourceUrl: string) => ({
    resource: {
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      cacheKey: sourceUrl,
      mimeType: 'image/png',
      originalName: 'remote.png',
      sourceUrl
    },
    status: 'ready'
  }))
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  clearAttachmentLibraryPathSnapshot,
  publishAttachmentLibraryPathSnapshot
} from '../attachments/attachmentLibraryPathSnapshot.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { readwiseKeepAdapter } from './readwiseKeepAdapter.js';
import { applyPristineReadwiseSourceProjection } from './readwiseSourceMigrationProjection.js';
import { localizeReadwiseSourceContent } from './readwiseTopicMergeLocalization.js';
import { resolveReadwiseTopicMergeSource } from './readwiseTopicMergeSource.js';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-projection-'));
  state.sourcePath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(state.sourcePath, { recursive: true });
  publishAttachmentLibraryPathSnapshot({
    assetsDir: path.join(tempRoot, 'assets'),
    libraryScope: 'test-library'
  });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
});

afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('reprojects content whose only drift is deterministic remote image localization', async () => {
  await seedLocalizedSource();

  await expect(applyPristineReadwiseSourceProjection('source-1', apiDocument()))
    .resolves.toBe(true);
  expect(readTopicContent()).toBe('API body');
});

it('preserves a genuinely edited body', async () => {
  await seedLocalizedSource();
  openDatabaseConnection().driver.execute(
    "UPDATE nodes SET content='My local edit' WHERE id='topic-1'"
  );

  await expect(applyPristineReadwiseSourceProjection('source-1', apiDocument()))
    .resolves.toBe(false);
  expect(readTopicContent()).toBe('My local edit');
});

async function seedLocalizedSource() {
  const sourceFile = path.join(state.sourcePath, 'Sample.md');
  await fs.writeFile(sourceFile, [
    '# Sample', '## Full Document',
    'Legacy ![](https://images.example/remote.png) body.'
  ].join('\n'));
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('topic-1',NULL,'topic','Sample',0,'placeholder','old','old')`);
  driver.execute(`INSERT INTO desktop_sources (source_ref,source_type,config_ref,host_name,host_platform,
    root_path,path_flavor,type_settings_json,created_at,updated_at) VALUES
    ('readwise:local','readwise','articles-local','This Mac',?,?,?,?, 'old','old')`,
  [process.platform, state.sourcePath, process.platform === 'win32' ? 'windows' : 'posix',
    JSON.stringify({ highlightPath: state.sourcePath, keepState: 'enabled', kind: 'articles' })]);
  driver.execute(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,source_locator,
    first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location) VALUES
    ('source-1','desktop_text_file','markdown','Sample.md',?,'old','old','hash','topic-1','readwise:local','Sample.md')`,
  [sourceFile]);
  const merge = await resolveReadwiseTopicMergeSource('topic-1');
  if (!merge) throw new Error('missing merge source');
  const prepared = await readwiseKeepAdapter.loadPreparedRecord(merge.descriptor, {
    highlightDirectoryPath: merge.readwiseSource.highlightPath,
    highlightPolicy: 'reference_only',
    importedAt: 'old',
    kind: merge.readwiseSource.kind,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const localized = await localizeReadwiseSourceContent(prepared.content);
  driver.execute("UPDATE nodes SET content=? WHERE id='topic-1'", [localized.text]);
}

function readTopicContent() {
  return openDatabaseConnection().driver.queryOne<{ content: string }>(
    "SELECT content FROM nodes WHERE id='topic-1'"
  )?.content;
}

function apiDocument(): PreparedReadwiseApiDocument {
  return {
    annotations: [], body: 'API body', category: 'article', coverImageUrl: null,
    createdAt: null, degradedReason: null, id: 'document-1',
    metadata: { author: null, category: 'article', readerUrl: null, sourceUrl: null, title: 'Sample' },
    title: 'Sample', unmatchedAnnotationCount: 0, updatedAt: null
  };
}
