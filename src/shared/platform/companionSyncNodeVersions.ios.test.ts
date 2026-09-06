import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { COMPANION_DATABASE_VERSION } from '../../../lib/platform/nativeCompanionContract';
import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import {
  applyCompanionLocalNodeVersions,
  applyCompanionSyncNodeVersions
} from './companionSyncNodeVersions';
import {
  createFakeCapacitorConnection,
  installCompanionNodeSchema
} from './companionSyncNodeVersionsTestSupport';
import { supportsCompanionNodeMutationSurface } from './companionWorkspaceRuntimeRepository';

const capacitorState = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'ios'),
  isNativePlatform: vi.fn(() => true)
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorState,
  registerPlugin: vi.fn(() => ({}))
}));

let database: Database.Database | null = null;

afterEach(() => {
  database?.close();
  database = null;
});

it('persists an iOS node version through the shared core with mutation UI available', async () => {
  database = new Database(':memory:');
  installCompanionNodeSchema(database);
  const connection = createConnection(database);
  const manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };

  await expect(applyCompanionSyncNodeVersions([iosNodeVersion()], manager as never))
    .resolves.toEqual(['ios-node-1']);

  expect(supportsCompanionNodeMutationSurface('quick-capture')).toBe(true);
  expect(manager.createConnection).toHaveBeenCalledWith(
    'foliole-companion',
    false,
    'no-encryption',
    COMPANION_DATABASE_VERSION,
    false
  );
  expect(connection.open).toHaveBeenCalledTimes(1);
  expect(connection.close).toHaveBeenCalledTimes(1);
  expect(database.prepare('SELECT title, current_version_id FROM nodes WHERE id = ?').get('ios-node-1')).toEqual({
    current_version_id: 'ios-device#1',
    title: 'iOS prepared node'
  });
});

it('marks a local iOS node version dirty while retaining its remote base hash', async () => {
  database = new Database(':memory:');
  installCompanionNodeSchema(database);
  const connection = createConnection(database);
  const manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };
  const remote = iosNodeVersion();
  await applyCompanionSyncNodeVersions([remote], manager as never);
  const local = {
    ...remote,
    content_hash: 'ios-local-hash',
    parent_version_id: remote.version_id,
    snapshot: {
      ...remote.snapshot,
      content: 'Locally edited body',
      updated_at: '2026-07-21T00:01:00.000Z'
    },
    updated_at: '2026-07-21T00:01:00.000Z',
    version_created_at: '2026-07-21T00:01:00.000Z',
    version_id: 'ios-device#2'
  } satisfies NativeSyncNodeRecord;

  await expect(applyCompanionLocalNodeVersions([local], manager as never))
    .resolves.toEqual(['ios-node-1']);

  expect(database.prepare(
    'SELECT current_version_id, sync_dirty FROM nodes WHERE id = ?'
  ).get('ios-node-1')).toEqual({ current_version_id: 'ios-device#2', sync_dirty: 1 });
  expect(database.prepare(
    `SELECT base_content_hash, content_hash, sync_dirty FROM sync_object_state
     WHERE object_type = 'node' AND object_id = ?`
  ).get('ios-node-1')).toEqual({
    base_content_hash: 'ios-node-hash',
    content_hash: 'ios-local-hash',
    sync_dirty: 1
  });
});

function iosNodeVersion(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: 'ios-node-hash',
    host_name: 'ios-device',
    object_id: 'ios-node-1',
    object_type: 'node',
    parent_version_id: null,
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'Prepared body',
      created_at: '2026-07-21T00:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: 'ios-node-1',
      image_regions: null,
      import_content_fingerprint: null,
      import_source_fingerprint: null,
      is_title_manual: false,
      kind: 'topic',
      opening_text: null,
      parent_id: null,
      position: null,
      priority: null,
      reveal: null,
      title: 'iOS prepared node',
      updated_at: '2026-07-21T00:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-07-21T00:00:00.000Z',
    version_created_at: '2026-07-21T00:00:00.000Z',
    version_id: 'ios-device#1'
  };
}

function createConnection(db: Database.Database) {
  const connection = createFakeCapacitorConnection(db);
  return {
    ...connection,
    close: vi.fn(connection.close),
    open: vi.fn(connection.open)
  };
}
