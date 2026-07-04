// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-incoming-updates-tests';

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
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { resolveIncomingUpdateTarget } from './incomingUpdates.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-incoming-updates-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedImportedTopic(input: { importedAt: string; nodeId: string; sourceLocator: string }) {
  upsertNodeSnapshot({
    anchorLink: null,
    content: '# Imported topic',
    createdAt: input.importedAt,
    isTitleManual: false,
    kind: 'topic',
    nodeId: input.nodeId,
    parentNodeId: null,
    position: null,
    priority: null,
    reveal: null,
    title: 'Imported topic',
    updatedAt: input.importedAt
  });
  openDatabaseConnection().driver.execute(
    `INSERT INTO import_runs (
       id, source_fingerprint, provider, source_kind, source_name, source_locator,
       content_fingerprint, duplicate_semantic, result_status, node_id, imported_at,
       degraded_reason, failure_reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `import-${input.nodeId}`,
      `source-${input.nodeId}`,
      'desktop_text_file',
      'markdown',
      path.basename(input.sourceLocator),
      input.sourceLocator,
      `content-${input.nodeId}`,
      'new',
      'imported',
      input.nodeId,
      input.importedAt,
      null,
      null
    ]
  );
}

it('targets the first live historical import when no mirror record exists', () => {
  const sourceLocator = path.join(tempRoot, 'Import', 'Memo', 'note.md');
  seedImportedTopic({
    importedAt: '2026-07-04T03:01:00.000Z',
    nodeId: 'node-original',
    sourceLocator
  });
  seedImportedTopic({
    importedAt: '2026-07-04T03:02:00.000Z',
    nodeId: 'node-duplicate',
    sourceLocator
  });

  expect(resolveIncomingUpdateTarget({
    relativePath: 'Memo/note.md',
    sourceLocator
  })).toEqual({
    sourcePath: 'Memo/note.md',
    topicId: 'node-original'
  });
});
