import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import {
  createFakeCapacitorConnection,
  installCompanionNodeSchema
} from '../shared/platform/companionSyncNodeVersionsTestSupport';

import { persistCompanionCapturedText } from './companionCaptureTextActions';

const runtimeState = vi.hoisted(() => ({
  manager: null as unknown
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

let database: Database.Database | null = null;

afterEach(() => {
  database?.close();
  database = null;
  runtimeState.manager = null;
  vi.restoreAllMocks();
});

it('persists an iOS quick capture through the shared node-version writer', async () => {
  database = new Database(':memory:');
  installCompanionNodeSchema(database);
  seedInboxNode(database);
  const connection = createFakeCapacitorConnection(database);
  runtimeState.manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000020')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000021');

  const result = await persistCompanionCapturedText({
    deviceId: 'ios-device',
    snapshot: createSnapshot(),
    text: '  iPhone note\nsecond line  '
  });

  expect(result.snapshot.nodesById[result.nodeId]).toMatchObject({
    content: 'iPhone note\nsecond line',
    parentNodeId: INBOX_NODE_ID,
    title: 'iPhone note'
  });
  expect(database.prepare(`
    SELECT content, last_modified_by_device_id, parent_id, title
    FROM nodes WHERE id = ?
  `).get(result.nodeId)).toEqual({
    content: 'iPhone note\nsecond line',
    last_modified_by_device_id: 'ios-device',
    parent_id: INBOX_NODE_ID,
    title: 'iPhone note'
  });
  expect(database.prepare('SELECT version_id FROM node_sync_versions WHERE object_id = ?').get(result.nodeId)).toEqual({
    version_id: 'ios-device#00000000-0000-4000-8000-000000000021'
  });
});

function seedInboxNode(db: Database.Database) {
  db.prepare(`
    INSERT INTO nodes (id, kind, title, created_at, updated_at)
    VALUES (?, 'folder', 'Inbox', ?, ?)
  `).run(INBOX_NODE_ID, '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z');
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
