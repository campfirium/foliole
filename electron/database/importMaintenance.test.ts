// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-maintenance-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { resetSeededWorkspace } from './databaseTestWorkspace.js';
import { resetImportData } from './importMaintenance.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';
import { saveReadingProgress } from './readingProgress.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-maintenance-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  resetSeededWorkspace();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createImport(fileName: string, filePath: string) {
  return createPreparedDesktopTextImport({
    content: `# ${fileName}\nBody`,
    degradedReason: null,
    fileName,
    filePath,
    importedAt: '2026-03-26T10:00:00.000Z',
    kind: 'markdown'
  });
}

function seedKeepImportItem(nodeId: string | null) {
  const connection = openDatabaseConnection();
  connection.sqlite
    .prepare(
      `INSERT INTO keep_import_items (
         rule_id, source_path, source_mtime_ms, source_size_bytes,
         highlight_source_mtime_ms, highlight_source_size_bytes, last_node_id,
         last_status, first_seen_at, last_seen_at, last_imported_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'rule-1',
      '/tmp/one.md',
      1,
      1,
      null,
      null,
      nodeId,
      'imported',
      '2026-03-26T10:00:00.000Z',
      '2026-03-26T10:00:00.000Z',
      '2026-03-26T10:00:00.000Z'
    );
}

function readImportMaintenanceCounts(firstNodeId: string | null, secondNodeId: string | null) {
  const connection = openDatabaseConnection();
  return {
    importRuns: connection.sqlite.prepare('SELECT COUNT(*) AS count FROM import_runs').get() as { count: number },
    importSources: connection.sqlite.prepare('SELECT COUNT(*) AS count FROM import_sources').get() as { count: number },
    keepImportItems: connection.sqlite.prepare('SELECT COUNT(*) AS count FROM keep_import_items').get() as { count: number },
    nodes: connection.sqlite
      .prepare('SELECT COUNT(*) AS count FROM nodes WHERE id IN (?, ?)')
      .get(firstNodeId, secondNodeId) as { count: number },
    nodeOrder: connection.sqlite
      .prepare('SELECT node_id FROM node_order ORDER BY position ASC')
      .all() as Array<{ node_id: string }>,
    activeNode: connection.sqlite
      .prepare(`SELECT value FROM workspace_meta WHERE key = 'active_node_id'`)
      .get() as { value: string } | undefined,
    nodeViewState: connection.sqlite
      .prepare('SELECT COUNT(*) AS count FROM node_view_state WHERE node_id = ?')
      .get(firstNodeId) as { count: number }
  };
}

it('clears import tracking tables and imported node trees together', () => {
  const first = runPreparedImport(createImport('one.md', '/tmp/one.md'));
  const second = runPreparedImport(createImport('two.md', '/tmp/two.md'));
  seedKeepImportItem(first.nodeId);
  saveReadingProgress({
    activeNodeId: first.nodeId,
    nodeViewStates: [{ nodeId: first.nodeId!, scrollTop: 12, selectionFrom: null, selectionTo: null }],
    updatedAt: '2026-03-26T10:01:00.000Z'
  });

  const result = resetImportData();
  const counts = readImportMaintenanceCounts(first.nodeId, second.nodeId);

  expect(result).toEqual({
    clearedImportRunCount: 2,
    clearedImportSourceCount: 2,
    clearedKeepImportItemCount: 1,
    deletedNodeCount: 2,
    deletedRootNodeCount: 2
  });
  expect(counts.importRuns.count).toBe(0);
  expect(counts.importSources.count).toBe(0);
  expect(counts.keepImportItems.count).toBe(0);
  expect(counts.nodes.count).toBe(0);
  expect(counts.nodeOrder).toEqual([]);
  expect(counts.activeNode).toBeUndefined();
  expect(counts.nodeViewState.count).toBe(0);
});
