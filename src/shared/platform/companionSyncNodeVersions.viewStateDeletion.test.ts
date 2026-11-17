import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createCompanionDatabase } from '../../../lib/core/database/companionDatabaseMigrationExecutor';
import { COMPANION_DATABASE_VERSION } from '../../../lib/platform/nativeCompanionContract';
import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import { applyCompanionSyncNodeVersionsWithSharedCore } from './companionSyncNodeVersions';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

let db: Database.Database | null = null;
afterEach(() => { db?.close(); db = null; });

it('applies a remote deletion of a topic this phone has opened and scrolled', async () => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const connection = createFakeCapacitorConnection(db) as never;
  const port = createCapacitorSqliteDbPort(connection, 'android');
  await port.transaction(tx => createCompanionDatabase(tx, COMPANION_DATABASE_VERSION));
  await applyCompanionSyncNodeVersionsWithSharedCore(connection, [topic('viewed#1', null, null)]);
  db.prepare(`INSERT INTO node_view_state (node_id, host_name, scroll_top, source, updated_at)
    VALUES ('viewed-topic', 'Phone', 480, 'user-scroll', '2026-10-24T00:00:00.000Z')`).run();

  await applyCompanionSyncNodeVersionsWithSharedCore(connection, [
    topic('viewed#2', 'viewed#1', '2026-10-24T01:00:00.000Z')
  ]);

  expect(db.prepare('SELECT id FROM nodes WHERE id = ?').get('viewed-topic')).toBeUndefined();
  expect(db.prepare('SELECT node_id FROM node_view_state WHERE node_id = ?').get('viewed-topic')).toBeUndefined();
  expect(db.prepare('SELECT version_id FROM node_sync_tombstones WHERE node_id = ?').get('viewed-topic'))
    .toEqual({ version_id: 'viewed#2' });
});

function topic(versionId: string, parentVersionId: string | null, deletedAt: string | null): NativeSyncNodeRecord {
  const at = deletedAt ?? '2026-10-23T00:00:00.000Z';
  return {
    ancestor_version_ids: parentVersionId ? [parentVersionId] : [],
    content_hash: `hash-${versionId}`, host_name: 'desktop', object_id: 'viewed-topic', object_type: 'node',
    ...(deletedAt ? { is_tombstone: true } : {}),
    parent_version_id: parentVersionId,
    snapshot: {
      anchor_link: null, attachments: [], content: 'Body', created_at: '2026-10-23T00:00:00.000Z', deleted_at: deletedAt,
      desired_retention: null, hide_title_heading: false, id: 'viewed-topic', image_regions: null, is_title_manual: false,
      kind: 'topic', opening_text: null, parent_id: null, position: null, priority: null, reveal: null,
      title: 'Viewed topic', updated_at: at, virtual_filter: null
    },
    updated_at: at, version_created_at: at, version_id: versionId
  } as NativeSyncNodeRecord;
}
