import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionCoreSchemaStatements';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionSyncSchemaStatements';
import { COMPANION_DATABASE_VERSION } from '../../../lib/platform/nativeCompanionContract';
import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import { applyCompanionSyncNodeVersions } from './companionSyncNodeVersions';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';
import { supportsCompanionNodeMutation } from './companionWorkspaceRuntimeRepository';

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

it('persists an iOS node version through the shared core while keeping mutation UI gated', async () => {
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

  expect(supportsCompanionNodeMutation()).toBe(false);
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

function iosNodeVersion(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: 'ios-node-hash',
    device_id: 'ios-device',
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

function installCompanionNodeSchema(db: Database.Database) {
  db.exec(ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS.join(';\n'));
  db.exec(ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS.join(';\n'));
  db.exec(`
    CREATE TABLE content_blobs (
      hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL,
      mime_type TEXT NOT NULL, compression TEXT NOT NULL,
      original_size_bytes INTEGER NOT NULL, stored_size_bytes INTEGER NOT NULL,
      original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL,
      availability TEXT NOT NULL, created_at TEXT NOT NULL,
      cached_at TEXT, last_verified_at TEXT
    );
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
  `);
}
