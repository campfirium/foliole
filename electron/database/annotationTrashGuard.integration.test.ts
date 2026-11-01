// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { captureAnnotationHistoryFact, hashAnnotationValue } from '../../lib/core/nodes/annotationHistoryFacts.js';
import type { NativeAnnotationTrashGuard } from '../../lib/platform/nativeTrashCommandMap.js';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: appDataDir,
  app_cache_dir: path.join(appDataDir, 'cache'), app_config_dir: path.join(appDataDir, 'config'),
  app_log_dir: path.join(appDataDir, 'logs') }) }));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { drainDirtyNodeSyncVersions } from './nodeSyncVersionDrain.js';
import { restoreNodesWithParents, softDeleteNodesWithParents } from './nodeTrashTransitions.js';
import { upsertVersionedNodeSnapshot } from './nodeVersionedMutations.js';

const now = '2026-10-01T00:00:00.000Z';
const child = { id: 'child', parentNodeId: 'parent', kind: 'item', content: 'Question', reveal: 'Answer', anchorLink: null };
const guard = (): NativeAnnotationTrashGuard => ({ mode: 'replay', expectedDeletedAt: null,
  nodes: [captureAnnotationHistoryFact(child)], parents: [{ nodeId: 'parent', imageRegionsHash: hashAnnotationValue(null) }] });
function seed(id: string, parentNodeId: string | null, content: string, reveal: string | null = null) {
  return upsertVersionedNodeSnapshot({ nodeId: id, parentNodeId, kind: reveal === null ? 'topic' : 'item',
    content, reveal, title: id, isTitleManual: true, anchorLink: null, position: 0, createdAt: now, updatedAt: now });
}
function rows() {
  return openDatabaseConnection().driver.queryAll('SELECT id, content, reveal, image_regions, deleted_at, current_version_id, sync_dirty FROM nodes ORDER BY id');
}
beforeEach(async () => {
  appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-annotation-guard-'));
  await initializeDatabase();
  seed('parent', null, 'Source');
  seed('child', 'parent', 'Question', 'Answer');
});
afterEach(async () => {
  await drainDirtyNodeSyncVersions();
  closeDatabaseConnection();
  await fs.rm(appDataDir, { recursive: true, force: true });
});

it.each(['body', 'answer', 'child', 'parent'])('rejects the complete transition after a newer %s fact without writes', change => {
  if (change === 'body') seed('child', 'parent', 'New question', 'Answer');
  if (change === 'answer') seed('child', 'parent', 'Question', 'New answer');
  if (change === 'child') seed('later-child', 'child', 'Do not hide this');
  if (change === 'parent') openDatabaseConnection().driver.execute('UPDATE nodes SET image_regions = ? WHERE id = ?',
    [JSON.stringify([{ attachmentId: 'new', regions: [] }]), 'parent']);
  const before = rows();
  expect(() => softDeleteNodesWithParents({ nodeIds: ['child'], deletedAt: now, annotationHistory: guard(),
    parentUpdates: [{ nodeId: 'parent', imageRegions: null, updatedAt: now }] })).toThrow('annotation_history_changed');
  expect(rows()).toEqual(before);
});

it('accepts restored facts after versions change and atomically restores the exact set', () => {
  seed('child', 'parent', 'Question', 'Changed answer');
  seed('child', 'parent', 'Question', 'Answer');
  softDeleteNodesWithParents({ nodeIds: ['child'], deletedAt: now, annotationHistory: guard() });
  expect(openDatabaseConnection().driver.queryOne('SELECT deleted_at FROM nodes WHERE id = ?', ['child']))
    .toEqual({ deleted_at: now });
  restoreNodesWithParents({ nodeIds: ['child'], annotationHistory: { ...guard(), expectedDeletedAt: now } });
  expect(openDatabaseConnection().driver.queryOne('SELECT deleted_at FROM nodes WHERE id = ?', ['child']))
    .toEqual({ deleted_at: null });
});

it('writes no member, parent, or version when one member of a grouped replay differs', () => {
  seed('second', 'parent', 'Second', 'Answer');
  const second = captureAnnotationHistoryFact({ ...child, id: 'second', content: 'Second' });
  seed('second', 'parent', 'Changed second', 'Answer');
  const before = rows();
  const versions = openDatabaseConnection().driver.queryAll('SELECT * FROM node_sync_versions ORDER BY version_id');
  const expected = guard();
  if (expected.mode !== 'replay') throw new Error('missing replay fixture');
  expect(() => softDeleteNodesWithParents({ nodeIds: ['child', 'second'], deletedAt: now,
    annotationHistory: { ...expected, nodes: [...expected.nodes, second] },
    parentUpdates: [{ nodeId: 'parent', imageRegions: null, updatedAt: now }] })).toThrow('annotation_history_changed');
  expect(rows()).toEqual(before);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM node_sync_versions ORDER BY version_id')).toEqual(versions);
});
