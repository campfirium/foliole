// @vitest-environment node
import { rm } from 'node:fs/promises';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { planStoredTopicBodies } from '../../lib/core/sync/requestSyncBodyRetention.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('repairs a retained historical body that exists only on the sender', { meta: { calibratedMs: 60_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const nodeId = 'historical-repair';
  try {
    await fixture.left.seed({ nodeId, title: 'History', content: 'Retained original body' });
    const versionId = (await readFixtureInventory(fixture.left)).find(entry => entry.globalId === nodeId)!.currentVersionId!;
    await fixture.left.invoke('retain_edit', { holdId: 'retained-source', nodeId, versionId });
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    await fixture.left.seed({ nodeId, title: 'History', content: 'Current body' });
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    // Model a retained legacy body and a receiver whose matching version lost its payload.
    for (const [databasePath, body] of [[fixture.leftSnapshot.databasePath, 'Retained original body'],
      [fixture.rightSnapshot.databasePath, null]] as const) {
      const db = new Database(databasePath);
      try {
        db.prepare(`UPDATE node_sync_versions SET body_text = ?,
          snapshot_json = json_set(snapshot_json, '$.content', ?, '$.body_deleted', json('false'))
          WHERE version_id = ?`).run(body, body, versionId);
        expect(db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(versionId)).toBe(body);
        // A separate stored branch remains protected even though it is not current.
        db.prepare('DELETE FROM node_sync_version_parents WHERE parent_version_id = ?').run(versionId);
        db.prepare('UPDATE node_sync_versions SET parent_version_id = NULL WHERE parent_version_id = ?').run(versionId);
        const head = String(db.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get(nodeId));
        const plan = await planStoredTopicBodies(createBetterSqliteDbPort(db), nodeId, head, 100);
        expect(plan.requiredBodyIds).toContain(versionId);
      } finally { db.close(); }
    }
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    const after = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try {
      expect(after.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(versionId))
        .toBe('Retained original body');
      expect(after.prepare('SELECT count(*) FROM node_sync_versions WHERE object_id = ?').pluck().get(nodeId)).toBe(2);
    } finally { after.close(); }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await rm(fixture.root, { recursive: true, force: true });
  }
});
