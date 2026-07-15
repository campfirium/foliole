// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-restore-conflict-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { restoreNodes, softDeleteNodes } from './nodeMutations.js';
import { getNodeRow, seedNode } from './nodeMutations.test.helpers.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-restore-conflict-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedImportRun(nodeId: string, importedAt: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO import_runs (
       id, source_fingerprint, provider, source_kind, source_name, source_locator,
       content_fingerprint, duplicate_semantic, result_status, node_id, imported_at,
       degraded_reason, failure_reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `import-${nodeId}`,
      'source-a',
      'desktop_text_file',
      'markdown',
      'note.md',
      '/tmp/note.md',
      'content-a',
      'new',
      'imported',
      nodeId,
      importedAt,
      null,
      null
    ]
  );
}

function setProvenance(nodeId: string, sourceFingerprint: string | null, contentFingerprint: string | null) {
  openDatabaseConnection().driver.execute(
    `UPDATE nodes
     SET import_source_fingerprint = ?, import_content_fingerprint = ?
     WHERE id = ?`,
    [sourceFingerprint, contentFingerprint, nodeId]
  );
}

it('skips restoring an imported trash duplicate when a same-source live node exists', () => {
  seedNode('node-live', null, 0);
  seedNode('node-trash', null, 1);
  setProvenance('node-live', 'source-a', 'content-a');
  setProvenance('node-trash', 'source-a', 'content-a');
  softDeleteNodes({
    deletedAt: '2026-05-18T00:02:00.000Z',
    nodeIds: ['node-trash']
  });

  const result = restoreNodes({ nodeIds: ['node-trash'] });

  expect(result).toEqual({
    restoredNodeIds: [],
    skippedConflicts: [{ liveNodeId: 'node-live', trashNodeId: 'node-trash' }]
  });
  expect(getNodeRow('node-live')?.deleted_at).toBeNull();
  expect(getNodeRow('node-trash')?.deleted_at).toBe('2026-05-18T00:02:00.000Z');
});

it('restores when matching import history no longer matches current live provenance', () => {
  seedNode('node-live', null, 0);
  seedNode('node-trash', null, 1);
  seedImportRun('node-live', '2026-05-18T00:00:00.000Z');
  seedImportRun('node-trash', '2026-05-18T00:01:00.000Z');
  setProvenance('node-live', 'source-a', 'content-new');
  setProvenance('node-trash', 'source-a', 'content-a');
  softDeleteNodes({ deletedAt: '2026-05-18T00:02:00.000Z', nodeIds: ['node-trash'] });

  expect(restoreNodes({ nodeIds: ['node-trash'] })).toEqual({
    restoredNodeIds: ['node-trash'],
    skippedConflicts: []
  });
  expect(getNodeRow('node-trash')?.deleted_at).toBeNull();
});

it('restores nodes with absent or incomplete provenance', () => {
  seedNode('node-live', null, 0);
  seedNode('node-trash', null, 1);
  setProvenance('node-live', 'source-a', 'content-a');
  setProvenance('node-trash', 'source-a', null);
  softDeleteNodes({ deletedAt: '2026-05-18T00:02:00.000Z', nodeIds: ['node-trash'] });

  expect(restoreNodes({ nodeIds: ['node-trash'] })).toEqual({
    restoredNodeIds: ['node-trash'],
    skippedConflicts: []
  });
});
