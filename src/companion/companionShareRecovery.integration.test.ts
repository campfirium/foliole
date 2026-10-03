// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ loadPendingShares: vi.fn(), acknowledgeShare: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => true },
  registerPlugin: () => native
}));

import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase, type IosCompanionDatabaseManager
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { applyCompanionLocalNodeVersions, applyCompanionSyncNodeVersions } from '../shared/platform/companionSyncObjects';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { toCompanionNativeNodeVersion } from './companionAnnotationNodeVersion';
import { consumeCompanionShareInbox } from './companionShareInboxRuntime';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';

let root = '';
let database: Database.Database | null = null;
const deliveryId = '00000000-0000-4000-8000-000000000001';
const topicId = `node-share-${deliveryId}`;
const text = '  Shared text\n\nhttps://example.org/path';

async function openLibrary() {
  const file = path.join(root, 'companion.db');
  const existed = existsSync(file);
  const sqlite = new Database(file);
  database = sqlite;
  const connection = { ...createFakeCapacitorConnection(sqlite), getUrl: async () => ({ url: file }) };
  const manager = {
    closeConnection: async () => { sqlite.close(); database = null; }, createConnection: async () => connection,
    isConnection: async () => ({ result: false }), isDatabase: async () => ({ result: existed }), retrieveConnection: async () => connection
  } as unknown as IosCompanionDatabaseManager;
  await initializeIosCompanionDatabase({ booted_at: '2026-10-03T00:00:00Z', database_path: null,
    database_ready: false, host_name: 'Share fixture', runtime_kind: 'android-capacitor' }, manager);
}
function pending() { return JSON.parse(readFileSync(path.join(root, 'pending.json'), 'utf8')); }
function facts() {
  return {
    topics: database!.prepare("SELECT id, parent_id, current_version_id, body_blob_hash FROM nodes WHERE id LIKE 'node-share-%'").all(),
    versions: database!.prepare("SELECT version_id, parent_version_id, content_hash FROM node_sync_versions WHERE object_id = ?").all(topicId)
  };
}
async function workspace() {
  const state = await loadCompanionWorkspaceSyncState();
  const actions = createWorkspaceSnapshotActions({ state, setState: () => {}, setError: () => {},
    setStatus: () => {}, setSyncConflictCount: () => {}, setSyncProgress: () => {} });
  return { bootstrapState: { device_id: 'share-device' }, state, refreshAfterMutation: actions.refreshAfterMutation };
}

beforeEach(async () => {
  vi.resetAllMocks();
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-share-recovery-'));
  await openLibrary();
  database!.prepare("INSERT INTO nodes (id,title,kind,created_at,updated_at) VALUES ('inbox','Inbox','folder',?,?)")
    .run('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
  writeFileSync(path.join(root, 'pending.json'), JSON.stringify({ items: [{ delivery_id: deliveryId,
    received_at: '2026-10-03T00:00:00Z', parts: [{ kind: 'text', value: '  Shared text' }, { kind: 'url', value: 'https://example.org/path' }] }] }));
  native.loadPendingShares.mockImplementation(async () => pending());
  native.acknowledgeShare.mockImplementation(async () => writeFileSync(path.join(root, 'pending.json'), '{"items":[]}'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(root, { recursive: true, force: true });
});

it('does not acknowledge a failed save and recovers through the production writer', async () => {
  const ui = await workspace();
  database!.exec("CREATE TRIGGER fail_share BEFORE INSERT ON nodes WHEN new.id LIKE 'node-share-%' BEGIN SELECT RAISE(ABORT,'save failure'); END");
  await expect(consumeCompanionShareInbox(ui)).rejects.toThrow();
  expect(pending().items).toHaveLength(1);
  expect(facts().topics).toHaveLength(0);
  database!.exec('DROP TRIGGER fail_share');
  await consumeCompanionShareInbox(ui);
  expect(pending().items).toHaveLength(0);
  expect(facts().topics).toHaveLength(1);
});

it('retries after a refresh failure with a stale snapshot without duplicate persisted facts', async () => {
  const ui = await workspace();
  const refresh = ui.refreshAfterMutation;
  ui.refreshAfterMutation = vi.fn().mockRejectedValueOnce(new Error('refresh failure')).mockImplementation(refresh);
  await expect(consumeCompanionShareInbox(ui)).rejects.toThrow('refresh failure');
  const saved = facts();
  expect(saved.topics).toHaveLength(1);
  expect(pending().items).toHaveLength(1);
  await consumeCompanionShareInbox(ui);
  expect(facts()).toEqual(saved);
  expect(pending().items).toHaveLength(0);
});

it('reopens and acknowledges a saved delivery after an ack failure without another version', async () => {
  native.acknowledgeShare.mockRejectedValueOnce(new Error('ack failure'));
  await expect(consumeCompanionShareInbox(await workspace())).rejects.toThrow('ack failure');
  const saved = facts();
  expect(saved.topics).toHaveLength(1);
  await closeIosCompanionDatabase();
  await openLibrary();
  const ui = await workspace();
  await consumeCompanionShareInbox(ui);
  expect(facts()).toEqual(saved);
  expect(pending().items).toHaveLength(0);
  expect((await loadCompanionWorkspaceNode(topicId))?.content).toBe(text);
});

it.each(['edit', 'move', 'delete'] as const)('keeps a later %s intact when acknowledging the original delivery', async (change) => {
  native.acknowledgeShare.mockRejectedValueOnce(new Error('ack failure'));
  await expect(consumeCompanionShareInbox(await workspace())).rejects.toThrow('ack failure');
  const original = (await loadCompanionWorkspaceNode(topicId))!;
  database!.prepare("INSERT INTO nodes (id,title,kind,created_at,updated_at) VALUES ('folder','Folder','folder',?,?)")
    .run(original.createdAt, original.updatedAt);
  const edited = { ...original, updatedAt: '2026-10-03T01:00:00Z',
    ...(change === 'edit' ? { content: 'Later user text' } : {}),
    ...(change === 'move' ? { parentNodeId: 'folder' } : {}),
    ...(change === 'delete' ? { deletedAt: '2026-10-03T01:00:00Z' } : {}) };
  await applyCompanionLocalNodeVersions([await toCompanionNativeNodeVersion(edited, 'share-device', 'ver_later')]);
  const saved = facts();
  const current = await loadCompanionWorkspaceNode(topicId);
  await closeIosCompanionDatabase();
  await openLibrary();
  await consumeCompanionShareInbox(await workspace());
  expect(facts()).toEqual(saved);
  expect(await loadCompanionWorkspaceNode(topicId)).toEqual(current);
  expect(pending().items).toHaveLength(0);
});

it('rejects changed content under a previously saved delivery id without acknowledging or overwriting it', async () => {
  native.acknowledgeShare.mockRejectedValueOnce(new Error('ack failure'));
  await expect(consumeCompanionShareInbox(await workspace())).rejects.toThrow('ack failure');
  const saved = facts();
  const payload = pending();
  payload.items[0].parts = [{ kind: 'text', value: 'Different content' }];
  writeFileSync(path.join(root, 'pending.json'), JSON.stringify(payload));
  await expect(consumeCompanionShareInbox(await workspace())).rejects.toThrow('share_delivery_collision');
  expect(facts()).toEqual(saved);
  expect((await loadCompanionWorkspaceNode(topicId))?.content).toBe(text);
  expect(pending().items).toHaveLength(1);
});


it('rolls the topic back when its durable receipt cannot be saved', async () => {
  database!.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON companion_meta WHEN new.key LIKE 'share-delivery:%' BEGIN SELECT RAISE(ABORT,'receipt failure'); END");
  await expect(consumeCompanionShareInbox(await workspace())).rejects.toThrow('receipt failure');
  expect(facts()).toEqual({ topics: [], versions: [] });
  expect(pending().items).toHaveLength(1);
  database!.exec('DROP TRIGGER fail_receipt');
  await consumeCompanionShareInbox(await workspace());
  expect(facts().topics).toHaveLength(1);
  expect(pending().items).toHaveLength(0);
});

it('acknowledges the same Android delivery after ack with a new receive time', async () => {
  const payload = pending();
  await consumeCompanionShareInbox(await workspace());
  const saved = facts();
  payload.items[0].received_at = '2026-10-03T02:00:00Z';
  writeFileSync(path.join(root, 'pending.json'), JSON.stringify(payload));
  await closeIosCompanionDatabase();
  await openLibrary();
  await consumeCompanionShareInbox(await workspace());
  expect(facts()).toEqual(saved);
  expect(pending().items).toHaveLength(0);
});

it.each([true, false])('preserves a permanent deletion with receipt present = %s', async (receiptPresent) => {
  native.acknowledgeShare.mockRejectedValueOnce(new Error('ack failure'));
  await expect(consumeCompanionShareInbox(await workspace())).rejects.toThrow('ack failure');
  const original = (await loadCompanionWorkspaceNode(topicId))!;
  await applyCompanionLocalNodeVersions([await toCompanionNativeNodeVersion({ ...original,
    content: 'Edited before permanent deletion', updatedAt: '2026-10-03T00:30:00Z'
  }, 'share-device', 'ver_before_delete')]);
  const current = (await loadCompanionWorkspaceNode(topicId))!;
  const deleted = await toCompanionNativeNodeVersion({ ...current,
    deletedAt: '2026-10-03T01:00:00Z', updatedAt: '2026-10-03T01:00:00Z'
  }, 'other-host', 'ver_deleted');
  await applyCompanionSyncNodeVersions([{ ...deleted, is_tombstone: true }]);
  await writeIosCompanionDatabase((db) => collectNodeVersionPayloads(db, topicId, Number.MAX_SAFE_INTEGER));
  expect(facts().versions).not.toEqual(expect.arrayContaining([expect.objectContaining({ version_id: `ver_share_${deliveryId}` })]));
  expect(facts().topics).toHaveLength(0);
  expect(database!.prepare('SELECT node_id FROM node_sync_tombstones WHERE node_id = ?').all(topicId)).toHaveLength(1);
  if (!receiptPresent) database!.prepare("DELETE FROM companion_meta WHERE key LIKE 'share-delivery:%'").run();
  const saved = facts();
  await closeIosCompanionDatabase();
  await openLibrary();
  if (receiptPresent) {
    await consumeCompanionShareInbox(await workspace());
    expect(pending().items).toHaveLength(0);
  } else {
    await expect(consumeCompanionShareInbox(await workspace())).rejects.toThrow('share_delivery_collision');
    expect(pending().items).toHaveLength(1);
  }
  expect(facts()).toEqual(saved);
});
