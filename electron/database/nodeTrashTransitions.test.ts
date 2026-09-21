// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
  })
}));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { seedNode } from './nodeMutations.test.helpers.js';
import { restoreNodesWithParents, softDeleteNodesWithParents } from './nodeTrashTransitions.js';

const timestamp = '2026-09-21T01:00:00.000Z';
const regions = [{ attachmentId: 'image', regions: [{ id: 'region', x: 0, y: 0, width: 0.5, height: 0.5 }] }];
const parentUpdate = { nodeId: 'parent', imageRegions: null, updatedAt: timestamp };
const deletion = { nodeIds: ['node-child'], deletedAt: timestamp, parentUpdates: [parentUpdate] };

beforeEach(async () => {
  appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-trash-transaction-'));
  initializeDatabase();
  seedNode('parent', null, 0);
  seedNode('node-child', 'parent', 1);
  openDatabaseConnection().driver.execute('UPDATE nodes SET image_regions = ? WHERE id = ?', [JSON.stringify(regions), 'parent']);
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(appDataDir, { recursive: true, force: true });
});

function rows() {
  return openDatabaseConnection().driver.queryAll(
    'SELECT id, deleted_at, image_regions, content, updated_at, sync_dirty, current_version_id FROM nodes ORDER BY id'
  );
}

function rejectWrite(column: string, nodeId: string) {
  openDatabaseConnection().sqlite.exec(`CREATE TRIGGER reject_write BEFORE UPDATE OF ${column} ON nodes
    WHEN NEW.id = '${nodeId}' BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`);
}

it.each(['deleted_at', 'image_regions'])('rolls back the entire delete when %s fails and survives reopening', (column) => {
  const before = rows();
  const versions = openDatabaseConnection().driver.queryAll('SELECT * FROM node_sync_versions ORDER BY version_id');
  rejectWrite(column, column === 'deleted_at' ? 'node-child' : 'parent');
  expect(() => softDeleteNodesWithParents(deletion)).toThrow('injected write failure');
  expect(rows()).toEqual(before);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM node_sync_versions ORDER BY version_id')).toEqual(versions);
  closeDatabaseConnection();
  expect(rows()).toEqual(before);
});

it('commits delete, undo and redo with parent regions while preserving the parent document', () => {
  softDeleteNodesWithParents(deletion);
  expect(rows()).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'node-child', deleted_at: timestamp }),
    expect.objectContaining({ id: 'parent', image_regions: null, content: '# parent' })
  ]));
  expect(restoreNodesWithParents({ nodeIds: deletion.nodeIds, parentUpdates: [{ ...parentUpdate, imageRegions: regions }] }))
    .toEqual({ restoredNodeIds: deletion.nodeIds, skippedConflicts: [] });
  closeDatabaseConnection();
  expect(rows()).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'node-child', deleted_at: null }),
    expect.objectContaining({ id: 'parent', image_regions: JSON.stringify(regions), content: '# parent' })
  ]));
  softDeleteNodesWithParents(deletion);
  closeDatabaseConnection();
  expect(rows()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'node-child', deleted_at: timestamp })]));
});

it('rolls back restored children when restoring parent regions fails', () => {
  softDeleteNodesWithParents(deletion);
  const before = rows();
  rejectWrite('image_regions', 'parent');
  expect(() => restoreNodesWithParents({ nodeIds: deletion.nodeIds, parentUpdates: [{ ...parentUpdate, imageRegions: regions }] }))
    .toThrow('injected write failure');
  expect(rows()).toEqual(before);
});

it('rolls back earlier parent updates when a later parent update fails', () => {
  seedNode('parent-2', null, 2);
  seedNode('child-2', 'parent-2', 3);
  const before = rows();
  rejectWrite('image_regions', 'parent-2');
  expect(() => softDeleteNodesWithParents({
    ...deletion, nodeIds: ['node-child', 'child-2'],
    parentUpdates: [parentUpdate, { ...parentUpdate, nodeId: 'parent-2' }]
  })).toThrow('injected write failure');
  expect(rows()).toEqual(before);
});

it('rejects unrelated parents without committing the delete', () => {
  seedNode('unrelated', null, 2);
  const before = rows();
  expect(() => softDeleteNodesWithParents({ ...deletion, parentUpdates: [{ ...parentUpdate, nodeId: 'unrelated' }] }))
    .toThrow('invalid Trash parent update');
  expect(rows()).toEqual(before);
});

it('rolls back the entire undo on a restore conflict when parent regions are included', () => {
  seedNode('live', 'parent', 2);
  openDatabaseConnection().driver.execute(
    "UPDATE nodes SET import_source_fingerprint = 'same-source', import_content_fingerprint = 'same-content' WHERE id IN ('live', 'node-child')"
  );
  softDeleteNodesWithParents(deletion);
  const before = rows();
  expect(() => restoreNodesWithParents({ nodeIds: deletion.nodeIds, parentUpdates: [{ ...parentUpdate, imageRegions: regions }] }))
    .toThrow('cannot restore complete Trash transition');
  expect(rows()).toEqual(before);
  expect(restoreNodesWithParents({ nodeIds: deletion.nodeIds }).skippedConflicts).toHaveLength(1);
});
