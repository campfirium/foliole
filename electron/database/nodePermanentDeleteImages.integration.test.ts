// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./releasedBodyCollectionTask.js', () => ({ enqueueReleasedBodyCollection: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));

import { handleNodeMutationCommand } from '../ipc/storageNodeMutationCommands.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently, upsertNodeSnapshot } from './nodeMutations.js';
import { seedNode, getNodeRow } from './nodeMutations.test.helpers.js';
import { drainDirtyNodeSyncVersions } from './nodeSyncVersionDrain.js';

const at = '2026-10-28T08:00:00.000Z';
const region = (id: string) => ({ id, x: 0, y: 0, width: 0.5, height: 0.5 });
const regions = [{ attachmentId: 'image', regions: [region('gone'), region('keep')] }];
function seedImageChild(grouped = false) {
  upsertNodeSnapshot({ nodeId: 'child', parentNodeId: 'parent', kind: 'item', title: 'Image item',
    isTitleManual: true, content: 'Child', reveal: 'Answer', position: null, createdAt: at, updatedAt: at,
    anchorLink: { id: 'gone', kind: 'cloze', locator: {
      attachmentId: 'image', x: 0, y: 0, width: 0.5, height: 0.5
    } }, ...(grouped ? { imageRegions: [{ attachmentId: 'image', regions: [region('gone')] }] } : {}) });
}
function parent() {
  return openDatabaseConnection().sqlite.prepare('SELECT * FROM nodes WHERE id = ?').get('parent') as {
    image_regions: string | null; current_version_id: string; [key: string]: unknown
  };
}
function expectPreserved(before: ReturnType<typeof parent>) {
  const changed = new Set(['image_regions', 'updated_at', 'last_modified_by_host_name', 'sync_dirty', 'current_version_id']);
  const unchanged = Object.fromEntries(Object.entries(before).filter(([key]) => !changed.has(key)));
  expect(parent()).toMatchObject(unchanged);
  expect(JSON.parse(parent().image_regions!)).toEqual([{ attachmentId: 'image', regions: [region('keep')] }]);
  expect(getNodeRow('parent')?.content).toBe('# parent');
  expect(getNodeRow('child')).toBeUndefined();
  expect(parent().current_version_id).not.toBe(before.current_version_id);
}

beforeEach(async () => {
  appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-permanent-image-'));
  initializeDatabase();
  seedNode('parent', null, 0);
  seedNode('unrelated', null, 1);
  openDatabaseConnection().driver.execute('UPDATE nodes SET image_regions = ? WHERE id = ?', [JSON.stringify(regions), 'parent']);
});
afterEach(async () => {
  await drainDirtyNodeSyncVersions();
  closeDatabaseConnection();
  await fs.rm(appDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

it.each([false, true])('cleans only the removed image region from database facts (grouped=%s)', async (grouped) => {
  seedImageChild(grouped);
  const before = parent();
  const unrelated = openDatabaseConnection().sqlite.prepare("SELECT * FROM nodes WHERE id = 'unrelated'").get();
  await handleNodeMutationCommand('delete_nodes_permanently', { nodeIds: ['child'] });
  expectPreserved(before);
  expect(openDatabaseConnection().sqlite.prepare("SELECT * FROM nodes WHERE id = 'unrelated'").get()).toEqual(unrelated);
  const version = openDatabaseConnection().sqlite.prepare('SELECT snapshot_json FROM node_sync_versions WHERE version_id = ?')
    .get(parent().current_version_id) as { snapshot_json: string };
  expect(JSON.parse(JSON.parse(version.snapshot_json).image_regions)).toEqual(JSON.parse(parent().image_regions!));
  closeDatabaseConnection();
  expectPreserved(before);
});

it('keeps a parent untouched when the image region was already removed by soft delete', () => {
  seedImageChild();
  openDatabaseConnection().driver.execute('UPDATE nodes SET image_regions = NULL WHERE id = ?', ['parent']);
  const before = parent();
  deleteNodesPermanently({ nodeIds: ['child'] });
  expect(parent()).toEqual(before);
});

it('rolls back parent regions and their versions when node deletion fails', () => {
  seedImageChild();
  const before = parent();
  const versions = openDatabaseConnection().sqlite.prepare('SELECT * FROM node_sync_versions WHERE object_id = ?').all('parent');
  openDatabaseConnection().driver.execute("CREATE TRIGGER reject_image_delete BEFORE DELETE ON nodes WHEN OLD.id = 'child' BEGIN SELECT RAISE(ABORT, 'delete failed'); END");
  expect(() => deleteNodesPermanently({ nodeIds: ['child'] })).toThrow('delete failed');
  expect(parent()).toEqual(before);
  expect(openDatabaseConnection().sqlite.prepare('SELECT * FROM node_sync_versions WHERE object_id = ?').all('parent')).toEqual(versions);
  expect(getNodeRow('child')).toBeDefined();
});

it('commits a normal soft-delete then permanent-delete without rewriting the cleared parent', async () => {
  seedImageChild();
  await handleNodeMutationCommand('soft_delete_nodes', { nodeIds: ['child'], deletedAt: at,
    parentUpdates: [{ nodeId: 'parent', imageRegions: [{ attachmentId: 'image', regions: [region('keep')] }], updatedAt: at }] });
  const before = parent();
  await handleNodeMutationCommand('delete_nodes_permanently', { nodeIds: ['child'] });
  expect(parent()).toEqual(before);
  expect(getNodeRow('child')).toBeUndefined();
});

it('cleans multiple children together and keeps same-named regions in other attachments', async () => {
  seedImageChild();
  seedNode('second', 'parent', 2);
  const driver = openDatabaseConnection().driver;
  driver.execute('UPDATE nodes SET anchor_link = ? WHERE id = ?', [JSON.stringify({ id: 'keep', kind: 'cloze',
    locator: { attachmentId: 'image', x: 0, y: 0, width: 0.5, height: 0.5 } }), 'second']);
  driver.execute('UPDATE nodes SET image_regions = ? WHERE id = ?', [JSON.stringify([
    ...regions, { attachmentId: 'other', regions: [region('gone')] }
  ]), 'parent']);
  await handleNodeMutationCommand('delete_nodes_permanently', { nodeIds: ['child', 'second'] });
  expect(JSON.parse(parent().image_regions!)).toEqual([{ attachmentId: 'other', regions: [region('gone')] }]);
  expect(getNodeRow('child')).toBeUndefined();
  expect(getNodeRow('second')).toBeUndefined();
});

it('preserves every parent field for a text anchor and for an already absent region', () => {
  seedImageChild();
  const driver = openDatabaseConnection().driver;
  driver.execute('UPDATE nodes SET anchor_link = ? WHERE id = ?', [JSON.stringify({
    id: 'gone', kind: 'highlight', locator: { from: 0, to: 1, originalText: '#' }
  }), 'child']);
  const before = parent();
  deleteNodesPermanently({ nodeIds: ['child'] });
  expect(parent()).toEqual(before);
  seedImageChild();
  driver.execute('UPDATE nodes SET image_regions = ? WHERE id = ?', [JSON.stringify([
    { attachmentId: 'image', regions: [region('keep')] }
  ]), 'parent']);
  const withoutTarget = parent();
  deleteNodesPermanently({ nodeIds: ['child'] });
  expect(parent()).toEqual(withoutTarget);
});

it('keeps the child recoverable when persisting the parent image update fails', () => {
  seedImageChild();
  const before = parent();
  openDatabaseConnection().driver.execute("CREATE TRIGGER reject_parent_image BEFORE UPDATE OF image_regions ON nodes WHEN OLD.id = 'parent' BEGIN SELECT RAISE(ABORT, 'parent failed'); END");
  expect(() => deleteNodesPermanently({ nodeIds: ['child'] })).toThrow('parent failed');
  expect(parent()).toEqual(before);
  expect(getNodeRow('child')).toBeDefined();
});
