// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from './desktopFramedSyncTwoProcess.testSupport.js';

it('keeps fresh ready ownership after business rollback and applies it after an actual receiver restart', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let succeeded = false;
  try {
    await fixture.left.seed({ content: 'Durable ready body', nodeId: 't326-rollback-ready', title: 'Ready' });
    const receiver = new Database(fixture.rightSnapshot.databasePath);
    try {
      receiver.exec(`CREATE TRIGGER reject_ready_node BEFORE INSERT ON nodes
        WHEN new.id = 't326-rollback-ready' BEGIN SELECT RAISE(ABORT, 'ready_business_rejected'); END`);
    } finally { receiver.close(); }
    await expect(reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).rejects.toThrow('ready_business_rejected');
    const failed = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
    expect(failed.nodes).toEqual([]);
    expect(failed.framedSync.inboundStates).toEqual([{ state: 'ready_to_apply' }]);
    expect(failed.framedSync.receipts).toBe(0);
    const owned = new Database(fixture.rightSnapshot.databasePath);
    try {
      expect(owned.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBeGreaterThan(0);
      owned.exec('DROP TRIGGER reject_ready_node');
    } finally { owned.close(); }
    const restarted = await fixture.restartRight();
    await reconnectFixturePeer(fixture.left, restarted.snapshot);
    const applied = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
    expect(applied.versions).toContainEqual(expect.objectContaining({ body_text: 'Durable ready body' }));
    expect(applied.framedSync.receipts).toBeGreaterThan(0);
    succeeded = true;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (succeeded) await fs.rm(fixture.root, { recursive: true, force: true });
    else console.info('Ready rollback fixture:', fixture.root);
  }
});
