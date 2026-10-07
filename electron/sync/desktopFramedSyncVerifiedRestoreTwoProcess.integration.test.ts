// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { preservedRestoreArticle, restoreBusinessRows, restoreIdentityState } from './desktopFramedSyncVerifiedRestoreTwoProcess.testSupport.js';
import { sourceArticleIdentity, verifiedReceiverArticle, verifiedReceiverEvidence } from './desktopFramedSyncVerifiedTwoProcess.testSupport.js';

const nodeId = 't326-verified-identity-restore';
const oldId = 't326-old-restored-library';
const content = '\ufeff恢复中😀\0文'.repeat(350_000);
const oldContent = '\ufeffOld independent library 中😀\0';

it.each(['restore', 'adoption'] as const)(
  'rolls an authenticated chunked %s round back as one business transaction and retries after process restart', async (mode) => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture();
    let succeeded = false;
    try {
      await fixture.left.seed({ content, nodeId, title: 'Restored source' });
      await fixture.right.seed({ content: oldContent, nodeId: oldId, title: 'Preserved old library' });
      await fixture.left.invoke('activate_chunked');
      await fixture.right.invoke('activate_chunked');
      await fixture.right.invoke('round', { input: { kind: 'read_inventory' } });
      const expected = sourceArticleIdentity(fixture.leftSnapshot.databasePath, nodeId);
      const previous = sourceArticleIdentity(fixture.rightSnapshot.databasePath, oldId);
      const args = { mode, peerOrigin: fixture.leftSnapshot.origin, peerDeviceId: 'desktop-a', restoreId: 't326-restore-round' };
      const directory = path.join(fixture.rightSnapshot.stateRoot, 'identity-restore-backups');
      expect(await fixture.right.invoke('begin_identity_restore', args)).toEqual({ directory });
      const before = restoreBusinessRows(fixture.rightSnapshot.databasePath);
      installReceiptFailure(fixture.rightSnapshot.databasePath);
      await expect(fixture.right.invoke('identity_restore_round', args)).rejects.toThrow('identity_restore_receipt_rejected');
      expect(restoreBusinessRows(fixture.rightSnapshot.databasePath)).toEqual(before);
      const failed = verifiedReceiverEvidence(fixture.rightSnapshot.databasePath, nodeId);
      expect(failed.node).toBeUndefined();
      expect(failed.versions).toEqual([]);
      expect(failed.receipts).toEqual([]);
      expect(failed.transfers.length).toBeGreaterThan(0);
      expect(failed.transfers.every((row) => (row as { state: string }).state === 'ready_to_apply')).toBe(true);
      expect(failed.pins.length).toBeGreaterThan(0);
      expect(failed.chunks.length).toBeGreaterThan(1);
      expect(await verifiedReceiverArticle(fixture.rightSnapshot.databasePath, oldId)).toMatchObject({ ...previous, content: oldContent });
      if (mode === 'restore') expect(await preservedRestoreArticle(directory, fixture.root, oldId))
        .toMatchObject({ ...previous, content: oldContent });
      const restarted = await fixture.restartRight('chunked');
      expect(restarted.snapshot.pid).not.toBe(fixture.rightSnapshot.pid);
      expect(verifiedReceiverEvidence(restarted.snapshot.databasePath, nodeId)).toEqual(failed);
      expect(restoreBusinessRows(restarted.snapshot.databasePath)).toEqual(before);
      removeReceiptFailure(restarted.snapshot.databasePath);
      expect(await fixture.right.invoke('identity_restore_round', args)).toMatchObject({ complete: true, pending: 0 });
      expect(await verifiedReceiverArticle(restarted.snapshot.databasePath, nodeId)).toMatchObject({ ...expected, content });
      const committed = verifiedReceiverEvidence(restarted.snapshot.databasePath, nodeId);
      expect(committed.continuousTable).toBeUndefined();
      expect(committed.receipts.length).toBeGreaterThan(0);
      expect(committed.pins).toEqual([]);
      expect(committed.frames).toEqual([]);
      expect(committed.chunks).toEqual([]);
      expect(verifiedReceiverEvidence(restarted.snapshot.databasePath, oldId).node).toBeUndefined();
      const identity = restoreIdentityState(restarted.snapshot.databasePath);
      if (mode === 'restore') expect(identity.restores).toEqual([expect.objectContaining({ restore_id: args.restoreId, applied_at: expect.any(String) })]);
      else {
        expect(identity.metadata).not.toEqual(expect.arrayContaining([expect.objectContaining({ key: 'sync_group_local_adoption' })]));
        expect(identity.metadata).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'sync_group_completed_adoption' })]));
      }
      succeeded = true;
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      if (succeeded) await fs.rm(fixture.root, { recursive: true, force: true });
      else console.info('Verified identity restore fixture:', fixture.root);
    }
  },
  30_000
);

function installReceiptFailure(databasePath: string) {
  const sqlite = new Database(databasePath);
  try {
    sqlite.exec(`CREATE TRIGGER reject_identity_restore_receipt BEFORE INSERT ON framed_sync_receipts
      BEGIN SELECT RAISE(ABORT, 'identity_restore_receipt_rejected'); END`);
  } finally { sqlite.close(); }
}

function removeReceiptFailure(databasePath: string) {
  const sqlite = new Database(databasePath);
  try { sqlite.exec('DROP TRIGGER reject_identity_restore_receipt'); } finally { sqlite.close(); }
}
