// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-deleted-instance-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { softDeleteNodes, upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { recordPreparedImportFailure, runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-pipeline-deleted-instance-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createImport(content: string, importedAt: string) {
  return createPreparedDesktopTextImport({
    content,
    degradedReason: null,
    fileName: 'note.md',
    filePath: '/tmp/note.md',
    importedAt,
    kind: 'markdown'
  });
}

function seedLiveImportRunNode(input: {
  content: string;
  contentFingerprint: string;
  importedAt: string;
  nodeId: string;
  sourceFingerprint: string;
}) {
  const driver = openDatabaseConnection().driver;
  upsertNodeSnapshot(driver, {
    nodeId: input.nodeId,
    parentNodeId: null,
    kind: 'topic',
    title: 'Imported',
    isTitleManual: false,
    content: input.content,
    reveal: null,
    anchorLink: null,
    position: null,
    createdAt: input.importedAt,
    updatedAt: input.importedAt
  });
  driver.execute(
    `INSERT INTO import_runs (
       id, source_fingerprint, provider, source_kind, source_name, source_locator,
       content_fingerprint, duplicate_semantic, result_status, node_id, imported_at,
       degraded_reason, failure_reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `import-${input.nodeId}`,
      input.sourceFingerprint,
      'desktop_text_file',
      'markdown',
      'note.md',
      '/tmp/note.md',
      input.contentFingerprint,
      'new',
      'imported',
      input.nodeId,
      input.importedAt,
      null,
      null
    ]
  );
}

it('creates a new tracked node after the previous imported node was deleted', () => {
  const first = runPreparedImport(createImport('# Imported\nBody', '2026-03-22T10:00:00.000Z'));

  softDeleteNodes(openDatabaseConnection().driver, {
    deletedAt: '2026-03-22T10:01:00.000Z',
    nodeIds: [first.nodeId!]
  });

  const second = runPreparedImport(createImport('# Imported\nBody', '2026-03-22T10:05:00.000Z'));
  const sourceRow = openDatabaseConnection().sqlite
    .prepare(
      `SELECT provider, source_kind, source_name, source_locator, latest_node_id
       FROM import_sources
       WHERE source_fingerprint = ?`
    )
    .get(first.sourceFingerprint);
  const runRows = openDatabaseConnection().sqlite
    .prepare(
      `SELECT duplicate_semantic, result_status, node_id, degraded_reason
       FROM import_runs
       WHERE source_fingerprint = ?
       ORDER BY imported_at ASC`
    )
    .all(first.sourceFingerprint);

  expect(second.duplicateSemantic).toBe('new');
  expect(second.nodeId).not.toBe(first.nodeId);
  expect(sourceRow).toEqual({
    latest_node_id: second.nodeId,
    provider: 'desktop_text_file',
    source_kind: 'markdown',
    source_locator: '/tmp/note.md',
    source_name: 'note.md'
  });
  expect(runRows).toEqual([
    { degraded_reason: null, duplicate_semantic: 'new', node_id: first.nodeId, result_status: 'imported' },
    { degraded_reason: null, duplicate_semantic: 'new', node_id: second.nodeId, result_status: 'imported' }
  ]);
});

it('reuses a live same-source same-content node when the latest imported node was deleted', () => {
  const first = runPreparedImport(createImport('# Imported\nBody', '2026-03-22T10:00:00.000Z'));
  softDeleteNodes(openDatabaseConnection().driver, {
    deletedAt: '2026-03-22T10:01:00.000Z',
    nodeIds: [first.nodeId!]
  });
  seedLiveImportRunNode({
    content: '# Imported\nBody',
    contentFingerprint: first.contentFingerprint,
    importedAt: '2026-03-22T10:02:00.000Z',
    nodeId: 'node-live-import',
    sourceFingerprint: first.sourceFingerprint
  });

  const second = runPreparedImport(createImport('# Imported\nBody', '2026-03-22T10:05:00.000Z'));
  const liveNodeCount = openDatabaseConnection().sqlite
    .prepare("SELECT COUNT(*) AS count FROM nodes WHERE deleted_at IS NULL AND title = 'Imported'")
    .get() as { count: number };
  const sourceRow = openDatabaseConnection().sqlite
    .prepare('SELECT latest_node_id FROM import_sources WHERE source_fingerprint = ?')
    .get(first.sourceFingerprint);

  expect(second.duplicateSemantic).toBe('duplicate');
  expect(second.nodeId).toBe('node-live-import');
  expect(liveNodeCount.count).toBe(1);
  expect(sourceRow).toEqual({ latest_node_id: 'node-live-import' });
});

it('keeps deleted-latest imports new when live same-source nodes have different content', () => {
  const first = runPreparedImport(createImport('# Imported\nBody', '2026-03-22T10:00:00.000Z'));
  softDeleteNodes(openDatabaseConnection().driver, {
    deletedAt: '2026-03-22T10:01:00.000Z',
    nodeIds: [first.nodeId!]
  });
  seedLiveImportRunNode({
    content: '# Imported\nOther body',
    contentFingerprint: 'other-content-fingerprint',
    importedAt: '2026-03-22T10:02:00.000Z',
    nodeId: 'node-live-other',
    sourceFingerprint: first.sourceFingerprint
  });

  const second = runPreparedImport(createImport('# Imported\nBody', '2026-03-22T10:05:00.000Z'));

  expect(second.duplicateSemantic).toBe('new');
  expect(second.nodeId).not.toBe(first.nodeId);
  expect(second.nodeId).not.toBe('node-live-other');
});

it('records failed imports against the reusable live same-source node', () => {
  const first = runPreparedImport(createImport('# Imported\nBody', '2026-03-22T10:00:00.000Z'));
  softDeleteNodes(openDatabaseConnection().driver, {
    deletedAt: '2026-03-22T10:01:00.000Z',
    nodeIds: [first.nodeId!]
  });
  seedLiveImportRunNode({
    content: '# Imported\nBody',
    contentFingerprint: first.contentFingerprint,
    importedAt: '2026-03-22T10:02:00.000Z',
    nodeId: 'node-live-failure',
    sourceFingerprint: first.sourceFingerprint
  });

  const failed = recordPreparedImportFailure(
    createImport('# Imported\nBody', '2026-03-22T10:05:00.000Z'),
    'boom'
  );

  expect(failed.duplicateSemantic).toBe('duplicate');
  expect(failed.nodeId).toBe('node-live-failure');
});
