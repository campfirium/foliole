import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { pushLocalDirtyObjects } from '../shared/platform/companionDesktopSyncPush';
import {
  createFakeCapacitorConnection,
  createFakeCompanionDatabaseOwner,
  installCompanionNodeSchema
} from '../shared/platform/companionSyncNodeVersionsTestSupport';

import { persistCompanionCapturedText } from './companionCaptureTextActions';

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
  registerPlugin: vi.fn(() => ({}))
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

it('persists and pushes an iOS quick capture through the shared node-version path', async () => {
  database = new Database(':memory:');
  installCompanionNodeSchema(database);
  seedInboxNode(database);
  installRuntimeManager(database);
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000020')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000021');
  configureAcceptedNodeAck();

  const result = await persistCompanionCapturedText({
    deviceId: 'ios-device',
    snapshot: createSnapshot(),
    text: '  iPhone note\nsecond line  '
  });

  expectPersistedCapture(database, result);
  await expect(pushLocalDirtyObjects('http://desktop.local')).resolves.toMatchObject({
    pushError: null,
    pushedObjectIds: [`node:${result.nodeId}`]
  });
  expectPushedCapture(database, result.nodeId);
  await expect(pushLocalDirtyObjects('http://desktop.local')).resolves.toMatchObject({
    pushError: null,
    pushedObjectIds: []
  });
  expect(runtimeState.postDesktopJson).toHaveBeenCalledTimes(1);
});

function installRuntimeManager(db: Database.Database) {
  const connection = createFakeCapacitorConnection(db);
  runtimeState.owner = createFakeCompanionDatabaseOwner(db);
  runtimeState.manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };
}

function configureAcceptedNodeAck() {
  runtimeState.postDesktopJson.mockResolvedValue({
    acks: [{
      client_op_id: 'node:ios-device#00000000-0000-4000-8000-000000000021',
      identity: {
        objectId: 'node-00000000-0000-4000-8000-000000000020',
        objectType: 'node',
        scope: 'workspace'
      },
      status: 'accepted',
      version_id: 'ios-device#00000000-0000-4000-8000-000000000021'
    }]
  });
}

function expectPersistedCapture(db: Database.Database, result: Awaited<ReturnType<typeof persistCompanionCapturedText>>) {
  expect(result.snapshot.nodesById[result.nodeId]).toMatchObject({
    content: 'iPhone note\nsecond line',
    parentNodeId: INBOX_NODE_ID,
    title: 'iPhone note'
  });
  expect(db.prepare(`
    SELECT content, last_modified_by_device_id, parent_id, title FROM nodes WHERE id = ?
  `).get(result.nodeId)).toEqual({
    content: 'iPhone note\nsecond line',
    last_modified_by_device_id: 'ios-device',
    parent_id: INBOX_NODE_ID,
    title: 'iPhone note'
  });
  expect(db.prepare('SELECT version_id FROM node_sync_versions WHERE object_id = ?').get(result.nodeId)).toEqual({
    version_id: 'ios-device#00000000-0000-4000-8000-000000000021'
  });
}

function expectPushedCapture(db: Database.Database, nodeId: string) {
  expect(runtimeState.postDesktopJson).toHaveBeenCalledWith(
    'http://desktop.local',
    '/companion/sync-push',
    { items: [expect.objectContaining({
      clientOpId: 'node:ios-device#00000000-0000-4000-8000-000000000021',
      identity: { objectId: nodeId, objectType: 'node', scope: 'workspace' }
    })] }
  );
  const cursor = db.prepare(`
    SELECT value FROM companion_meta WHERE key = 'sync_node_version_push_cursor'
  `).get() as { value: string };
  expect(JSON.parse(cursor.value)).toEqual({
    change_id: 'ios-device#00000000-0000-4000-8000-000000000021',
    created_at: expect.any(String)
  });
}

function seedInboxNode(db: Database.Database) {
  db.prepare(`
    INSERT INTO nodes (id, kind, title, created_at, updated_at)
    VALUES (?, 'folder', 'Inbox', ?, ?)
  `).run(INBOX_NODE_ID, '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z');
  db.prepare(`
    INSERT INTO companion_meta (key, value, updated_at)
    VALUES ('device_id', 'ios-device', '2026-07-21T00:00:00.000Z')
  `).run();
}

function createSnapshot(): WorkspaceSnapshot {
  const timestamp = '2026-07-21T00:00:00.000Z';
  return {
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID],
    nodesById: {
      [INBOX_NODE_ID]: {
        anchorLink: null,
        content: '',
        createdAt: timestamp,
        hideTitleHeading: false,
        id: INBOX_NODE_ID,
        isTitleManual: false,
        kind: 'folder',
        openingText: null,
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Inbox',
        updatedAt: timestamp
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}
