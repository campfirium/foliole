import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { pushLocalDirtyObjects } from '../shared/platform/companionDesktopSyncPush';
import {
  createFakeCapacitorConnection,
  createFakeCompanionDatabaseOwner,
  installCompanionNodeSchema
} from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { supportsCompanionNodeMutationSurface } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { restoreCompanionTrashNode } from './companionTrashActions';

const runtimeState = vi.hoisted(() => ({
  manager: null as unknown,
  owner: null as unknown,
  postDesktopJson: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'ios'),
    isNativePlatform: vi.fn(() => true)
  },
  registerPlugin: vi.fn(() => ({
    loadPairingState: vi.fn(async () => ({ remote_peer_id: 'desktop-peer' }))
  }))
}));

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(function SQLiteConnection() {
    return runtimeState.manager;
  })
}));

vi.mock('../shared/platform/companionDesktopSyncHttp', () => ({
  postDesktopJson: runtimeState.postDesktopJson
}));

vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => runtimeState.owner
}));

let database: Database.Database | null = null;

afterEach(() => {
  database?.close();
  database = null;
  runtimeState.manager = null;
  runtimeState.owner = null;
  vi.restoreAllMocks();
});

it('persists and pushes an iOS trash restore while keeping its interaction hidden', async () => {
  database = new Database(':memory:');
  installCompanionNodeSchema(database);
  seedTrashedNode(database);
  const manager = installRuntimeManager(database);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000031');
  configureAcceptedNodeAck();

  const result = await restoreCompanionTrashNode({
    deviceId: 'ios-device',
    nodeId: 'topic-trash',
    snapshot: createSnapshot()
  });

  expect(result).not.toBeNull();
  expect(result?.snapshot.nodesById['topic-trash']?.deletedAt).toBeNull();
  expect(result?.snapshot.trashedNodeIds).toEqual([]);
  expect(supportsCompanionNodeMutationSurface('trash-restore')).toBe(false);
  expect(database.prepare(
    'SELECT current_version_id, deleted_at, sync_dirty FROM nodes WHERE id = ?'
  ).get('topic-trash')).toEqual({
    current_version_id: 'ver_00000000-0000-4000-8000-000000000031',
    deleted_at: null,
    sync_dirty: 0
  });

  await expect(pushLocalDirtyObjects('http://desktop.local')).resolves.toMatchObject({
    pushError: null,
    pushedObjectIds: ['node:topic-trash']
  });
  const pushedItem = runtimeState.postDesktopJson.mock.calls[0]?.[2]?.items?.[0];
  expect(pushedItem).toMatchObject({
    identity: { objectId: 'topic-trash', objectType: 'node', scope: 'workspace' }
  });
  expect(JSON.parse(pushedItem.payloadJson).snapshot.deleted_at).toBeNull();
  expect(manager.createConnection).not.toHaveBeenCalled();
  expectNodePushCursor(database);
  await expect(pushLocalDirtyObjects('http://desktop.local')).resolves.toMatchObject({
    pushError: null,
    pushedObjectIds: []
  });
  expect(runtimeState.postDesktopJson).toHaveBeenCalledTimes(1);
});

it('rejects an iOS restore when its persisted base has advanced', async () => {
  database = new Database(':memory:');
  installCompanionNodeSchema(database);
  seedTrashedNode(database);
  database.prepare(
    "UPDATE nodes SET current_version_id = 'desktop#newer' WHERE id = 'topic-trash'"
  ).run();
  installRuntimeManager(database);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000032');

  await expect(restoreCompanionTrashNode({
    deviceId: 'ios-device',
    nodeId: 'topic-trash',
    snapshot: createSnapshot()
  })).rejects.toThrow('local_restore_not_applied');

  expect(database.prepare(
    'SELECT current_version_id, deleted_at FROM nodes WHERE id = ?'
  ).get('topic-trash')).toEqual({
    current_version_id: 'desktop#newer',
    deleted_at: '2026-07-21T00:00:00.000Z'
  });
  expect(database.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get()).toEqual({ count: 0 });
});

function installRuntimeManager(db: Database.Database) {
  const connection = createFakeCapacitorConnection(db);
  runtimeState.owner = createFakeCompanionDatabaseOwner(db);
  const manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };
  runtimeState.manager = manager;
  return manager;
}

function configureAcceptedNodeAck() {
  runtimeState.postDesktopJson.mockResolvedValue({
    acks: [{
      client_op_id: 'node:ver_00000000-0000-4000-8000-000000000031',
      identity: { objectId: 'topic-trash', objectType: 'node', scope: 'workspace' },
      status: 'accepted',
      version_id: 'ver_00000000-0000-4000-8000-000000000031'
    }]
  });
}

function expectNodePushCursor(db: Database.Database) {
  expect(db.prepare(`
    SELECT peer_id, stream_name, operation_id, object_id, status
    FROM sync_delivery_receipts WHERE object_id = 'topic-trash'
  `).get()).toEqual({
    object_id: 'topic-trash',
    operation_id: 'node:ver_00000000-0000-4000-8000-000000000031',
    peer_id: 'desktop-peer',
    status: 'confirmed',
    stream_name: 'node_version'
  });
}

function seedTrashedNode(db: Database.Database) {
  db.prepare(`
    INSERT INTO nodes (
      id, kind, title, content, current_version_id, last_modified_by_host_name,
      sync_dirty, created_at, updated_at, deleted_at
    ) VALUES (?, 'topic', 'Trashed topic', 'Body', 'desktop#base', 'desktop', 0, ?, ?, ?)
  `).run(
    'topic-trash',
    '2026-07-20T00:00:00.000Z',
    '2026-07-21T00:00:00.000Z',
    '2026-07-21T00:00:00.000Z'
  );
  db.prepare(`
    INSERT INTO companion_meta (key, value, updated_at) VALUES
      ('device_id', 'ios-device', '2026-07-21T00:00:00.000Z'),
      ('host_name', 'ios-device', '2026-07-21T00:00:00.000Z')
  `).run();
}

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: null,
    nodeOrder: [],
    nodesById: {
      'topic-trash': {
        anchorLink: null,
        content: 'Body',
        createdAt: '2026-07-20T00:00:00.000Z',
        currentVersionId: 'desktop#base',
        deletedAt: '2026-07-21T00:00:00.000Z',
        hideTitleHeading: false,
        id: 'topic-trash',
        isTitleManual: false,
        kind: 'topic',
        openingText: null,
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Trashed topic',
        updatedAt: '2026-07-21T00:00:00.000Z'
      }
    },
    trashedNodeDeletedAtById: { 'topic-trash': '2026-07-21T00:00:00.000Z' },
    trashedNodeIds: ['topic-trash'],
    untitledSequenceByParent: {}
  };
}
