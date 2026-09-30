// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import type { CompanionSyncPushPayload } from './companionSyncPushTypes.js';
import { applyCompanionStateSyncPushWithDbPort } from './companionSyncPushWithDbPort.js';

const Database = createRequire(import.meta.url)('better-sqlite3') as typeof import('better-sqlite3');
let root = '';
let db: import('better-sqlite3').Database;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'foliole-parent-identity-'));
  db = new Database(path.join(root, 'target.db'));
  db.pragma('foreign_keys = ON');
  initializeDatabaseSchema(db);
});
afterEach(async () => { db.close(); await rm(root, { recursive: true, force: true }); });

function record(version: string, parent: string | null = null): NativeSyncNodeRecord {
  const at = parent ? '2026-08-25T12:59:23.201Z' : '2026-08-25T12:59:23.146Z';
  return {
    ancestor_version_ids: parent ? [parent] : [], body_text: version, content_hash: version,
    host_name: 'V', object_id: 'topic', object_type: 'node', parent_version_id: parent,
    parent_version_ids: parent ? [parent] : [], updated_at: at, version_created_at: at, version_id: version,
    snapshot: { anchor_link: null, attachments: [], content: version, created_at: '2026-08-25T12:59:23.146Z',
      deleted_at: null, desired_retention: null, hide_title_heading: false, id: 'topic', image_regions: null,
      is_title_manual: true, kind: 'topic', opening_text: null, parent_id: null, position: 0, priority: null,
      reveal: null, title: version, updated_at: at, virtual_filter: null }
  };
}
function push(node: NativeSyncNodeRecord): CompanionSyncPushPayload {
  return { authorHostName: 'V', base: { ancestorVersionIds: node.ancestor_version_ids, kind: 'node_version',
    parentVersionId: node.parent_version_id }, clientOpId: `node:${node.version_id}`, contentHash: node.content_hash!,
    identity: { objectId: node.object_id, objectType: 'node', scope: 'workspace' },
    payloadJson: JSON.stringify(node), updatedAt: node.updated_at };
}
function persisted() {
  db.close();
  db = new Database(path.join(root, 'target.db'));
  return db.prepare('SELECT version_id, parent_version_id FROM node_sync_versions ORDER BY version_id').all();
}
it('retains both identities when the same batch contains a parent and its newer child', async () => {
  await applySyncNodesWithDbPort(createBetterSqliteDbPort(db), [record('parent'), record('child', 'parent')]);
  expect(persisted()).toEqual([{ version_id: 'child', parent_version_id: 'parent' },
    { version_id: 'parent', parent_version_id: null }]);
  expect(db.prepare('SELECT content,current_version_id FROM nodes WHERE id = ?').get('topic'))
    .toEqual({ content: 'child', current_version_id: 'child' });
});
it('rolls back a missing-parent node instead of publishing an incomplete history', async () => {
  await expect(applySyncNodesWithDbPort(createBetterSqliteDbPort(db), [record('child', 'missing')]))
    .rejects.toThrow(/missing_parent/);
  expect(persisted()).toEqual([]);
  expect(db.prepare("SELECT count(*) count FROM nodes WHERE id = 'topic'").get()).toEqual({ count: 0 });
});
it('rejects a missing-parent push without acknowledging or persisting it', async () => {
  await expect(applyCompanionStateSyncPushWithDbPort(createBetterSqliteDbPort(db),
    [push(record('child', 'missing'))])).rejects.toThrow(/missing_parent/);
  expect(persisted()).toEqual([]);
});
it('accepts a child after its actual parent has been received and preserves replay', async () => {
  const port = createBetterSqliteDbPort(db);
  await applyCompanionStateSyncPushWithDbPort(port, [push(record('parent'))]);
  const payload = push(record('child', 'parent'));
  expect((await applyCompanionStateSyncPushWithDbPort(port, [payload])).acks).toMatchObject([{ status: 'accepted' }]);
  expect((await applyCompanionStateSyncPushWithDbPort(port, [payload])).acks).toMatchObject([{ status: 'accepted' }]);
  expect(persisted()).toHaveLength(2);
});
it('accepts a complete push batch even when the child precedes its parent', async () => {
  const result = await applyCompanionStateSyncPushWithDbPort(createBetterSqliteDbPort(db),
    [push(record('child', 'parent')), push(record('parent'))]);
  expect(result.acks).toHaveLength(2);
  expect(result.acks.every((ack) => ack.status === 'accepted')).toBe(true);
  expect(persisted()).toHaveLength(2);
});
