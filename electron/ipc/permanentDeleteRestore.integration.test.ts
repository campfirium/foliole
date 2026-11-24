// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { restoreNodes, softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import { resetSearchInvalidationCoalescerForTests } from '../database/searchIndexInvalidationCoalescer.js';
import * as mirrorRetirements from '../mirror/mirrorPermanentDelete.js';

import { handlePermanentDeleteNodeCommand } from './permanentDeleteCommand.js';

let root = '';
const NOW = '2026-10-23T00:00:00.000Z';
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../database/releasedBodyCollectionTask.js', () => ({ enqueueReleasedBodyCollection: vi.fn() }));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-trash-restore-'));
  initializeDatabase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  resetSearchInvalidationCoalescerForTests();
  closeDatabaseConnection();
  await fs.rm(root, { force: true, recursive: true, maxRetries: 5, retryDelay: 100 });
});

function seed(id: string, parentNodeId: string | null = null, content = id, kind: 'topic' | 'folder' = 'topic') {
  upsertNodeSnapshot({
    nodeId: id, parentNodeId, kind, title: id, isTitleManual: true, content, reveal: null, anchorLink: null,
    position: null, createdAt: NOW, updatedAt: NOW
  });
}

function restoreAfterFirstBatch(nodeIds: string[], pendingId: string, committedId: string) {
  const retire = mirrorRetirements.retirePermanentMirrorPaths;
  vi.spyOn(mirrorRetirements, 'retirePermanentMirrorPaths').mockImplementationOnce(async mirrors => {
    await retire(mirrors);
    const { driver } = openDatabaseConnection();
    expect(driver.queryOne('SELECT deleted_at FROM nodes WHERE id = ?', [pendingId])).toEqual({ deleted_at: NOW });
    expect(driver.queryOne('SELECT id FROM nodes WHERE id = ?', [committedId])).toBeUndefined();
    expect(restoreNodes({ nodeIds }).restoredNodeIds).toEqual(nodeIds);
  });
}

function tombstones() {
  return openDatabaseConnection().driver.queryAll<{ node_id: string }>(
    'SELECT node_id FROM node_sync_tombstones ORDER BY node_id').map(row => row.node_id);
}

it('excludes a topic restored between batches from deletion, tombstones, and attachment cleanup', async () => {
  const attachmentId = 'a'.repeat(64);
  const content = `![Keep](asset://${attachmentId}.png)`;
  const removedIds = Array.from({ length: 11 }, (_, index) => `trash-${index}`);
  seed('restored', null, content);
  removedIds.forEach(id => seed(id, null, content));
  const attachmentPath = resolveAttachmentStoragePath(attachmentId, undefined, 'image/png');
  await fs.mkdir(path.dirname(attachmentPath), { recursive: true });
  await fs.writeFile(attachmentPath, 'attachment');
  const nodeIds = ['restored', ...removedIds];
  softDeleteNodes({ nodeIds, deletedAt: NOW });
  restoreAfterFirstBatch(['restored'], 'restored', removedIds.at(-1)!);

  const result = await handlePermanentDeleteNodeCommand({ nodeIds }, null);

  closeDatabaseConnection();
  expect(openDatabaseConnection().driver.queryAll('SELECT id, content, deleted_at FROM nodes WHERE id = ?', ['restored']))
    .toEqual([{ id: 'restored', content, deleted_at: null }]);
  expect(tombstones()).toEqual([...removedIds].sort());
  expect(result).toEqual({ removedNodeIds: removedIds });
  await expect(fs.readFile(attachmentPath, 'utf8')).resolves.toBe('attachment');
});

it('keeps the ancestors of a restored child and continues deleting independent trash', async () => {
  seed('folder', null, '', 'folder');
  seed('subfolder', 'folder', '', 'folder');
  seed('restored', 'subfolder');
  const removedIds = Array.from({ length: 11 }, (_, index) => `trash-${index}`);
  removedIds.forEach(id => seed(id, 'subfolder'));
  removedIds.unshift('independent');
  seed('independent');
  const nodeIds = ['folder', 'subfolder', 'restored', ...removedIds];
  softDeleteNodes({ nodeIds, deletedAt: NOW });
  restoreAfterFirstBatch(['restored'], 'restored', removedIds.at(-1)!);

  const result = await handlePermanentDeleteNodeCommand({ nodeIds }, null);

  expect(openDatabaseConnection().driver.queryAll(
    "SELECT id, parent_id, deleted_at FROM nodes WHERE id IN ('folder', 'subfolder', 'restored') ORDER BY id"))
    .toEqual([
      { id: 'folder', parent_id: null, deleted_at: NOW },
      { id: 'restored', parent_id: 'subfolder', deleted_at: null },
      { id: 'subfolder', parent_id: 'folder', deleted_at: NOW }
    ]);
  expect(tombstones()).toEqual([...removedIds].sort());
  expect(result).toEqual({ removedNodeIds: removedIds });
});
