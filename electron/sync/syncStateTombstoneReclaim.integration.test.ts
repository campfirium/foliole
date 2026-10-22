// @vitest-environment node
import { expect, it } from 'vitest';

import { upsertExternalResourceSyncState } from '../../lib/core/database/externalResourceSyncState.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

import { groupRound, retireThirdMember, withDb, withFixture } from './syncHistoryHorizon.testSupport.js';

const DELETED_AT = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const SHARED = [['external_document', 'gone-document'], ['external_folder', 'gone-folder']] as const;
const LOCAL = [['node', 'gone-node'], ['node_reading', 'gone-node']] as const;

/** Deletions whose objects no longer exist anywhere on this device, made a month ago. */
function seedDeletions(databasePath: string) {
  withDb(databasePath, db => {
    const driver = createBetterSqlite3Driver(db);
    for (const [objectType, objectId] of SHARED) upsertExternalResourceSyncState(driver, { objectType, objectId,
      contentHash: computeSyncContentHash(objectType, buildCanonicalSyncTombstone(objectId)),
      deletedAt: DELETED_AT, lastModifiedByHostName: 'desktop-a', syncDirty: true, updatedAt: DELETED_AT });
    // The node row is local residue outside the inventory; the orphan reading mark is shared like production writes it.
    for (const [objectType, objectId] of LOCAL) upsertSyncObjectState(driver, { objectType, objectId,
      contentHash: computeSyncContentHash('node_reading', { deleted_at: DELETED_AT, node_id: objectId, object_type: objectType }),
      deletedAt: DELETED_AT, lastModifiedByHostName: 'desktop-a', syncDirty: false, updatedAt: DELETED_AT });
  });
}

function deletionMarks(databasePath: string) {
  return withDb(databasePath, db => db.prepare(`SELECT object_type || ':' || object_id FROM sync_object_state
    WHERE object_id IN ('gone-document', 'gone-folder', 'gone-node') ORDER BY 1`).pluck().all());
}

it('reclaims deletion marks of objects that are gone everywhere once every member has passed them', { meta: { calibratedMs: 90_000 } }, async () => withFixture(async (fixture, trackThird) => {
  const started = await fixture.startThird();
  trackThird(started.process);
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) retireThirdMember(path, started.snapshot.deviceId);
  seedDeletions(fixture.leftSnapshot.databasePath);
  expect(deletionMarks(fixture.leftSnapshot.databasePath)).toHaveLength(4);

  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
    expect(deletionMarks(path)).toEqual([]);
  }
  expect(await groupRound(fixture.right, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
    expect(deletionMarks(path)).toEqual([]);
  }
}));
