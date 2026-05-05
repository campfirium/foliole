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

import { softDeleteNodes } from '../../lib/core/database/nodeMutations.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
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
