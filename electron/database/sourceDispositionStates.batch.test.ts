// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-source-disposition-batch-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently, restoreNodes, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { listSourceDispositionRecords } from './sourceDispositionStates.js';
import { measureSqlStatements } from './sqlStatementMeter.testSupport.js';

const AT = '2026-05-19T00:00:00.000Z';
const DELETED_AT = '2026-05-19T01:00:00.000Z';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-source-disposition-batch-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedTopic(nodeId: string) {
  upsertNodeSnapshot({
    anchorLink: null, content: `# ${nodeId}`, createdAt: AT, isTitleManual: true, kind: 'topic', nodeId,
    parentNodeId: null, position: 0, reveal: null, title: nodeId, updatedAt: AT
  });
}

function seedImportItem(nodeId: string, sourcePath: string, title: string) {
  const { sqlite } = openDatabaseConnection();
  sqlite.prepare(
    `INSERT INTO keep_import_items (
       rule_id, source_path, source_mtime_ms, source_size_bytes, last_node_id, last_status, first_seen_at, last_seen_at
     ) VALUES ('keep-rule', ?, 1, 2, ?, 'imported', ?, ?)`
  ).run(sourcePath, nodeId, AT, AT);
  sqlite.prepare(
    `INSERT INTO keep_import_item_cache (
       rule_id, source_path, title, source_mtime_ms, source_size_bytes, refreshed_at
     ) VALUES ('keep-rule', ?, ?, 1, 2, ?)`
  ).run(sourcePath, title, AT);
}

async function countSourceLookups(execute: () => unknown) {
  const { report } = await measureSqlStatements(execute);
  return report.records.filter((entry) => /^SELECT .*FROM keep_import_items/.test(entry.sql)).length;
}

it('looks up import sources once per Trash or restore operation, however many topics are selected', async () => {
  const nodeIds = ['node-0', 'node-1', 'node-2', 'node-3', 'node-4'];
  for (const nodeId of nodeIds) {
    seedTopic(nodeId);
    seedImportItem(nodeId, `Articles/${nodeId}.md`, nodeId);
  }

  expect(await countSourceLookups(() => softDeleteNodes({ deletedAt: DELETED_AT, nodeIds }))).toBe(1);
  expect(listSourceDispositionRecords()).toHaveLength(5);
  expect(await countSourceLookups(() => restoreNodes({ nodeIds }))).toBe(1);
  expect(listSourceDispositionRecords()).toEqual([]);
});

it('records and clears each selected topic from its own first import item', () => {
  const nodeIds = ['node-shared', 'node-untitled', 'node-local', 'node-other'];
  for (const nodeId of nodeIds) seedTopic(nodeId);
  // Path order differs from insertion order: the earliest inserted item is the one that counts.
  seedImportItem('node-shared', 'Second/First seen.md', 'First seen');
  seedImportItem('node-shared', 'First/Later seen.md', 'Later seen');
  // A blank first title records nothing, even though a later item has one.
  seedImportItem('node-untitled', 'Blank/Blank.md', '   ');
  seedImportItem('node-untitled', 'Blank/Titled.md', 'Titled later');
  seedImportItem('node-other', 'Other.md', ' Other ');

  softDeleteNodes({ deletedAt: DELETED_AT, nodeIds });

  const record = { disposition: 'soft_deleted', sourceKind: 'keep', updatedAt: DELETED_AT };
  expect(listSourceDispositionRecords()).toEqual([
    { ...record, originalTitle: 'Other', sourceScope: 'keep-rule:.' },
    { ...record, originalTitle: 'First seen', sourceScope: 'keep-rule:Second' }
  ]);

  restoreNodes({ nodeIds });

  expect(listSourceDispositionRecords()).toEqual([]);
});

it('looks up import sources once per permanent delete and keeps each topic Trash time', async () => {
  const nodeIds = ['node-0', 'node-1', 'node-2', 'node-3', 'node-4'];
  const trashedAt = nodeIds.map((_, index) => `2026-05-19T0${index + 1}:00:00.000Z`);
  for (const [index, nodeId] of nodeIds.entries()) {
    seedTopic(nodeId);
    seedImportItem(nodeId, `Articles/${nodeId}.md`, nodeId);
    softDeleteNodes({ deletedAt: trashedAt[index]!, nodeIds: [nodeId] });
  }

  const { report } = await measureSqlStatements(() => deleteNodesPermanently({ nodeIds }));

  expect(report.records.filter((entry) => /^SELECT .*FROM keep_import_items item /.test(entry.sql))).toHaveLength(1);
  expect(listSourceDispositionRecords()).toEqual(nodeIds.map((nodeId, index) => ({
    disposition: 'hard_deleted', originalTitle: nodeId, sourceKind: 'keep',
    sourceScope: 'keep-rule:Articles', updatedAt: trashedAt[index]
  })));
});
