import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionCoreSchemaStatements';
import { ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionResourceSchemaStatements';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionSyncSchemaStatements';
import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import { applyCompanionSyncNodeVersionsWithSharedCore } from './companionSyncNodeVersions';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

it('applies node versions against the Android companion schema without desktop search invalidations', async () => {
  db = new Database(':memory:');
  installAndroidNodeApplySchema(db);

  await expect(applyCompanionSyncNodeVersionsWithSharedCore(createFakeCapacitorConnection(db) as never, [
    nodeVersion()
  ])).resolves.toEqual(['node-android']);

  expect(db.prepare('SELECT title, current_version_id FROM nodes WHERE id = ?').get('node-android')).toEqual({
    current_version_id: 'android#1',
    title: 'Android highlight'
  });
});

function nodeVersion(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: 'hash-android',
    host_name: 'android-device',
    object_id: 'node-android',
    object_type: 'node',
    parent_version_id: null,
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'Body',
      created_at: '2026-05-04T01:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: 'node-android',
      image_regions: null,
      is_title_manual: false,
      kind: 'highlight',
      opening_text: null,
      parent_id: null,
      position: null,
      priority: null,
      reveal: null,
      title: 'Android highlight',
      updated_at: '2026-05-04T01:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-05-04T01:00:00.000Z',
    version_created_at: '2026-05-04T01:00:00.000Z',
    version_id: 'android#1'
  };
}

function installAndroidNodeApplySchema(database: Database.Database) {
  database.exec(ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS.join(';\n'));
}
