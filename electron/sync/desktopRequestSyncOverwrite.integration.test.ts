// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { overwriteProgressRow } from './desktopFramedSyncVerifiedRestoreTwoProcess.testSupport.js';

it.each(['restore', 'adoption'] as const)('resumes production %s after an object fails and the receiver restarts', async mode => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  let passed = false;
  try {
    await fixture.left.seed({ content: 'First complete body', nodeId: 'a', title: 'First' });
    await fixture.left.seed({ content: 'Second complete body', nodeId: 'b', title: 'Second' });
    await fixture.right.seed({ content: 'Old local library', nodeId: 'old', title: 'Old' });
    if (mode === 'restore') await fixture.left.invoke('publish_identity_restore', {
      mode, peerOrigin: fixture.rightSnapshot.origin,
      peerDeviceId: fixture.rightSnapshot.deviceId, restoreId: 'request-restore'
    });
    await fixture.right.invoke('begin_identity_restore', { mode, peerOrigin: fixture.leftSnapshot.origin,
      peerDeviceId: fixture.leftSnapshot.deviceId, restoreId: 'request-restore' });
    const request = { input: { kind: 'request_reconcile', peerOrigin: fixture.leftSnapshot.origin,
      peer: { deviceId: fixture.leftSnapshot.deviceId, libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch` } } };
    withDb(fixture.rightSnapshot.databasePath, db => db.exec(`CREATE TRIGGER reject_second_object
      BEFORE INSERT ON nodes WHEN NEW.id = 'b' BEGIN SELECT RAISE(ABORT, 'second_object_failed'); END`));
    await expect(fixture.right.invoke('round', request)).rejects.toThrow('second_object_failed');
    expect(bodies(fixture.rightSnapshot.databasePath)).toEqual([{ id: 'a', content: 'First complete body' }]);
    const progress = overwriteProgressRow(fixture.rightSnapshot.databasePath);
    expect(progress).toBeDefined();
    withDb(fixture.rightSnapshot.databasePath, db => db.exec('DROP TRIGGER reject_second_object'));
    await fixture.restartRight();
    expect(overwriteProgressRow(fixture.rightSnapshot.databasePath)).toEqual(progress);
    expect(await fixture.right.invoke('round', request)).toMatchObject({ complete: true });
    expect(bodies(fixture.rightSnapshot.databasePath)).toEqual([
      { id: 'a', content: 'First complete body' }, { id: 'b', content: 'Second complete body' }
    ]);
    expect(overwriteProgressRow(fixture.rightSnapshot.databasePath)).toBeUndefined();
    withDb(fixture.rightSnapshot.databasePath, db => {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get('framed_sync_inbound_transfers')).toBeUndefined();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get('framed_sync_receipts')).toBeUndefined();
      expect(db.prepare('SELECT DISTINCT object_id FROM node_sync_versions ORDER BY object_id')
        .all()).toEqual([{ object_id: 'a' }, { object_id: 'b' }, { object_id: 'special-inbox' }]);
    });
    passed = true;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
    else console.info('Request overwrite fixture:', fixture.root);
  }
}, 60_000);

function withDb<T>(file: string, run: (db: Database.Database) => T) {
  const db = new Database(file);
  try { return run(db); } finally { db.close(); }
}

function bodies(file: string) {
  return withDb(file, db => db.prepare("SELECT id, content FROM nodes WHERE id IN ('a', 'b', 'old') ORDER BY id").all());
}
