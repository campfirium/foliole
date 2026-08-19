import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionCoreSchemaStatements';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionSyncSchemaStatements';
import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import { applyCompanionSyncNodeVersionsWithSharedCore } from './companionSyncNodeVersions';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

it('rejects local restore before opening a transaction when the deleted base cannot be followed', async () => {
  db = new Database(':memory:');
  installSchema(db);
  seedBlockedDeletedNode(db);
  const connection = createMockConnection(db);

  await expect(applyCompanionSyncNodeVersionsWithSharedCore(
    connection as never,
    [restoreVersion()],
    'local_restore'
  )).rejects.toThrow('local_restore_not_applied');

  expect(connection.beginTransaction).not.toHaveBeenCalled();
});

function seedBlockedDeletedNode(database: Database.Database) {
  database.prepare(`
    INSERT INTO nodes (
      id, kind, title, content, current_version_id, sync_dirty, created_at, updated_at, deleted_at
    ) VALUES ('node-1', 'topic', 'Android Node', 'Body', 'desktop#other', 0, ?, ?, ?)
  `).run(
    '2026-05-04T01:00:00.000Z',
    '2026-05-04T02:00:00.000Z',
    '2026-05-04T02:00:00.000Z'
  );
}

function restoreVersion(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: 'hash-1',
    host_name: 'android-device',
    object_id: 'node-1',
    object_type: 'node',
    parent_version_id: 'desktop#base',
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'Body',
      created_at: '2026-05-04T01:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: 'node-1',
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
      title: 'Android Node',
      updated_at: '2026-05-04T03:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-05-04T03:00:00.000Z',
    version_created_at: '2026-05-04T03:00:00.000Z',
    version_id: 'android#restore'
  };
}

function createMockConnection(database: Database.Database) {
  const connection = createFakeCapacitorConnection(database);
  return {
    ...connection,
    beginTransaction: vi.fn(connection.beginTransaction)
  };
}

function installSchema(database: Database.Database) {
  database.exec(ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS.join(';\n'));
}
