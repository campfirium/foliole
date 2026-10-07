// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { sourceArticleIdentity, verifiedReceiverArticle, verifiedReceiverEvidence } from './desktopFramedSyncVerifiedTwoProcess.testSupport.js';

const content = '\ufeff中😀\0文'.repeat(350000);
const nodeId = 't326-verified-receiver';

async function closeFixture(fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>, succeeded: boolean) {
  await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
  if (succeeded) await fs.rm(fixture.root, { recursive: true, force: true });
  else console.info('Verified receive fixture:', fixture.root);
}

describe.each(['continuous', 'chunked'] as const)('authenticated source storage %s', (sourceStorage) => {
  registerReceiveTest(sourceStorage);
  registerRestartTest(sourceStorage);
});

it('exchanges inventory and delivers a stable publication through the production authenticated round', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture({ rightBodyStorage: 'chunked' });
  let succeeded = false;
  try {
    await fixture.left.seed({ content, nodeId, title: 'Verified round' });
    await fixture.left.invoke('activate_chunked');
    const expected = sourceArticleIdentity(fixture.leftSnapshot.databasePath, nodeId);
    const result = await fixture.left.invoke('round', { input: {
      kind: 'reconcile', peer: { deviceId: 'desktop-b', libraryEpoch: 'desktop-b-epoch' },
      peerOrigin: fixture.rightSnapshot.origin
    } });
    expect(result).toMatchObject({ complete: true, pending: 0 });
    expect(await verifiedReceiverArticle(fixture.rightSnapshot.databasePath, nodeId))
      .toMatchObject({ ...expected, content });
    expect(verifiedReceiverEvidence(fixture.leftSnapshot.databasePath, nodeId).continuousTable).toBeUndefined();
    expect(verifiedReceiverEvidence(fixture.rightSnapshot.databasePath, nodeId).pins).toEqual([]);
    succeeded = true;
  } finally { await closeFixture(fixture, succeeded); }
});

it('requests a stable remote difference and converges through the inbound authenticated round', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let succeeded = false;
  try {
    await fixture.right.seed({ content, nodeId, title: 'Verified pull' });
    await fixture.left.invoke('activate_chunked');
    await fixture.right.invoke('activate_chunked');
    const expected = sourceArticleIdentity(fixture.rightSnapshot.databasePath, nodeId);
    const input = { kind: 'reconcile', peer: { deviceId: 'desktop-b', libraryEpoch: 'desktop-b-epoch' },
      peerOrigin: fixture.rightSnapshot.origin };
    expect(await fixture.left.invoke('round', { input })).toMatchObject({ complete: true, pending: 0 });
    expect(await verifiedReceiverArticle(fixture.leftSnapshot.databasePath, nodeId))
      .toMatchObject({ ...expected, content });
    expect(verifiedReceiverEvidence(fixture.leftSnapshot.databasePath, nodeId).continuousTable).toBeUndefined();
    // Applying the node publishes its local parent-order fact, which the next round exchanges.
    expect(await fixture.left.invoke('round', { input }))
      .toEqual({ complete: true, pending: 0, transferred: 1 });
    const read = { input: { kind: 'read_inventory' } };
    expect(await fixture.left.invoke('round', read)).toEqual(await fixture.right.invoke('round', read));
    expect(await fixture.left.invoke('round', { input }))
      .toEqual({ complete: true, pending: 0, transferred: 0 });
    succeeded = true;
  } finally { await closeFixture(fixture, succeeded); }
});

function registerReceiveTest(sourceStorage: 'continuous' | 'chunked') {
  it('receives large Unicode through authenticated HTTP between two independent processes using chunked receiver storage', async () => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture({ rightBodyStorage: 'chunked' });
    let succeeded = false;
    try {
      expect(fixture.leftSnapshot.pid).not.toBe(fixture.rightSnapshot.pid);
      expect(fixture.leftSnapshot.databasePath).not.toBe(fixture.rightSnapshot.databasePath);
      await fixture.left.seed({ content, nodeId, title: 'Verified receive' });
      if (sourceStorage === 'chunked') {
        await fixture.left.invoke('activate_chunked');
        expect(verifiedReceiverEvidence(fixture.leftSnapshot.databasePath, nodeId).continuousTable).toBeUndefined();
      }
      const expected = sourceArticleIdentity(fixture.leftSnapshot.databasePath, nodeId);
      await fixture.left.synchronize(fixture.rightSnapshot.origin, nodeId);
      expect(await verifiedReceiverArticle(fixture.rightSnapshot.databasePath, nodeId)).toMatchObject({ ...expected, content });
      const evidence = verifiedReceiverEvidence(fixture.rightSnapshot.databasePath, nodeId);
      expect(evidence.continuousTable).toBeUndefined();
      expect(evidence.receipts).toHaveLength(1);
      expect(evidence.transfers).toEqual([{ state: 'applied', header_json: null, active_attempt_id: null }]);
      expect(evidence.pins).toEqual([]);
      expect(evidence.available).toEqual([]);
      expect(evidence.chunks).toEqual([]);
      expect(evidence.versions).toEqual([expect.objectContaining({ body_text: null, content: null })]);
      succeeded = true;
    } finally { await closeFixture(fixture, succeeded); }
  });

}

function registerRestartTest(sourceStorage: 'continuous' | 'chunked') {
  it('retains authenticated ready ownership after late receipt rollback and applies after an actual receiver process restart', async () => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture({ rightBodyStorage: 'chunked' });
    let succeeded = false;
    try {
      await fixture.left.seed({ content, nodeId, title: 'Verified restart' });
      if (sourceStorage === 'chunked') await fixture.left.invoke('activate_chunked');
      const expected = sourceArticleIdentity(fixture.leftSnapshot.databasePath, nodeId);
      const receiver = new Database(fixture.rightSnapshot.databasePath);
      try {
        receiver.exec(`CREATE TRIGGER reject_verified_http_receipt BEFORE INSERT ON framed_sync_receipts
          BEGIN SELECT RAISE(ABORT, 'verified_http_receipt_rejected'); END`);
      } finally { receiver.close(); }
      await expect(fixture.left.synchronize(fixture.rightSnapshot.origin, nodeId)).rejects.toThrow('verified_http_receipt_rejected');
      const failed = verifiedReceiverEvidence(fixture.rightSnapshot.databasePath, nodeId);
      expect(failed.continuousTable).toBeUndefined();
      expect(failed.node).toBeUndefined();
      expect(failed.versions).toEqual([]);
      expect(failed.receipts).toEqual([]);
      expect(failed.transfers).toEqual([expect.objectContaining({ state: 'ready_to_apply' })]);
      expect(failed.pins.length).toBeGreaterThan(0);
      expect(failed.frames.length).toBeGreaterThan(0);
      expect(failed.chunks.length).toBeGreaterThan(1);
      const restarted = await fixture.restartRight();
      expect(restarted.snapshot.pid).not.toBe(fixture.rightSnapshot.pid);
      const reopened = verifiedReceiverEvidence(restarted.snapshot.databasePath, nodeId);
      expect(reopened).toEqual(failed);
      const retry = new Database(restarted.snapshot.databasePath);
      try { retry.exec('DROP TRIGGER reject_verified_http_receipt'); } finally { retry.close(); }
      await fixture.left.synchronize(restarted.snapshot.origin, nodeId);
      expect(await verifiedReceiverArticle(restarted.snapshot.databasePath, nodeId)).toMatchObject({ ...expected, content });
      const committed = verifiedReceiverEvidence(restarted.snapshot.databasePath, nodeId);
      expect(committed.continuousTable).toBeUndefined();
      expect(committed.receipts).toHaveLength(1);
      expect(committed.pins).toEqual([]);
      expect(committed.frames).toEqual([]);
      expect(committed.chunks).toEqual([]);
      succeeded = true;
    } finally { await closeFixture(fixture, succeeded); }
  });
}
