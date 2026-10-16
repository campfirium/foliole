// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { sourceArticleIdentity, verifiedReceiverArticle, verifiedReceiverBusinessEvidence } from './desktopFramedSyncVerifiedTwoProcess.testSupport.js';
import { requestProcessEvidence } from './requestSyncProcessRecovery.testSupport.js';

const prefix = '\ufeff中😀\0文';
const content = prefix + 'x'.repeat(1048576 - Buffer.byteLength(prefix));
const nodeId = 't326-verified-receiver';

async function closeFixture(fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>, succeeded: boolean) {
  await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
  if (succeeded) await fs.rm(fixture.root, { recursive: true, force: true });
  else console.info('Verified receive fixture:', fixture.root);
}

registerReceiveTest();
registerRestartTest();

it('exchanges inventory and delivers complete original facts through the production authenticated round', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  let succeeded = false;
  try {
    await fixture.left.seed({ content, nodeId, title: 'Verified round' });
    const expected = sourceArticleIdentity(fixture.leftSnapshot.databasePath, nodeId);
    const result = await fixture.left.invoke('round', { input: {
      kind: 'request_reconcile', peer: { deviceId: fixture.rightSnapshot.deviceId, libraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch` },
      peerOrigin: fixture.rightSnapshot.origin
    } });
    expect(result).toEqual({ complete: true });
    expect(await verifiedReceiverArticle(fixture.rightSnapshot.databasePath, nodeId))
      .toMatchObject({ ...expected, content });
    expect(requestProcessEvidence(fixture.rightSnapshot.databasePath, nodeId).retiredTables).toEqual([]);
    succeeded = true;
  } finally { await closeFixture(fixture, succeeded); }
});

it('requests a stable remote difference and converges through the inbound authenticated round', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  let succeeded = false;
  try {
    await fixture.right.seed({ content, nodeId, title: 'Verified pull' });
    const expected = sourceArticleIdentity(fixture.rightSnapshot.databasePath, nodeId);
    const input = { kind: 'request_reconcile', peer: { deviceId: fixture.rightSnapshot.deviceId, libraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch` },
      peerOrigin: fixture.rightSnapshot.origin };
    expect(await fixture.left.invoke('round', { input })).toEqual({ complete: true });
    expect(await verifiedReceiverArticle(fixture.leftSnapshot.databasePath, nodeId))
      .toMatchObject({ ...expected, content });
    const originalFacts = requestProcessEvidence(fixture.leftSnapshot.databasePath, nodeId).versions;
    // A repeat round must converge without duplicating or changing the original versions.
    expect(await fixture.left.invoke('round', { input }))
      .toEqual({ complete: true });
    const read = { input: { kind: 'read_inventory' } };
    expect(await fixture.left.invoke('round', read)).toEqual(await fixture.right.invoke('round', read));
    expect(await fixture.left.invoke('round', { input }))
      .toEqual({ complete: true });
    expect(requestProcessEvidence(fixture.leftSnapshot.databasePath, nodeId).versions).toEqual(originalFacts);
    succeeded = true;
  } finally { await closeFixture(fixture, succeeded); }
});

function registerReceiveTest() {
  it('receives an exact 1 MiB Unicode body through authenticated HTTP between independent processes', async () => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
    let succeeded = false;
    try {
      expect(fixture.leftSnapshot.pid).not.toBe(fixture.rightSnapshot.pid);
      expect(fixture.leftSnapshot.databasePath).not.toBe(fixture.rightSnapshot.databasePath);
      await fixture.left.seed({ content, nodeId, title: 'Verified receive' });
      const expected = sourceArticleIdentity(fixture.leftSnapshot.databasePath, nodeId);
      await fixture.left.synchronize(fixture.rightSnapshot.origin, nodeId);
      expect(await verifiedReceiverArticle(fixture.rightSnapshot.databasePath, nodeId)).toMatchObject({ ...expected, content });
      const evidence = verifiedReceiverBusinessEvidence(fixture.rightSnapshot.databasePath, nodeId);
      expect(requestProcessEvidence(fixture.rightSnapshot.databasePath, nodeId).retiredTables).toEqual([]);
      expect(evidence.versions).toEqual([expect.objectContaining({ body_text: content })]);
      succeeded = true;
    } finally { await closeFixture(fixture, succeeded); }
  });

}

function registerRestartTest() {
  it('rolls back a version write failure and receives original facts after an actual receiver process restart', async () => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
    let succeeded = false;
    try {
      await fixture.left.seed({ content, nodeId, title: 'Verified restart' });
      const expected = sourceArticleIdentity(fixture.leftSnapshot.databasePath, nodeId);
      const receiver = new Database(fixture.rightSnapshot.databasePath);
      try {
        receiver.exec(`CREATE TRIGGER reject_verified_http_version BEFORE INSERT ON node_sync_versions
          WHEN new.object_id = 't326-verified-receiver'
          BEGIN SELECT RAISE(ABORT, 'verified_http_version_rejected'); END`);
      } finally { receiver.close(); }
      await expect(fixture.left.synchronize(fixture.rightSnapshot.origin, nodeId)).rejects.toThrow('verified_http_version_rejected');
      const failed = verifiedReceiverBusinessEvidence(fixture.rightSnapshot.databasePath, nodeId);
      expect(failed.node).toBeUndefined();
      expect(failed.versions).toEqual([]);
      expect(requestProcessEvidence(fixture.rightSnapshot.databasePath, nodeId)).toMatchObject({
        nodes: [], versions: [], parents: [], state: [], retiredTables: []
      });
      const restarted = await fixture.restartRight();
      expect(restarted.snapshot.pid).not.toBe(fixture.rightSnapshot.pid);
      const reopened = verifiedReceiverBusinessEvidence(restarted.snapshot.databasePath, nodeId);
      expect(reopened).toEqual(failed);
      const retry = new Database(restarted.snapshot.databasePath);
      try { retry.exec('DROP TRIGGER reject_verified_http_version'); } finally { retry.close(); }
      await fixture.left.synchronize(restarted.snapshot.origin, nodeId);
      expect(await verifiedReceiverArticle(restarted.snapshot.databasePath, nodeId)).toMatchObject({ ...expected, content });
      const committed = verifiedReceiverBusinessEvidence(restarted.snapshot.databasePath, nodeId);
      expect(committed.versions).toEqual([expect.objectContaining({ body_text: content })]);
      expect(requestProcessEvidence(restarted.snapshot.databasePath, nodeId).retiredTables).toEqual([]);
      succeeded = true;
    } finally { await closeFixture(fixture, succeeded); }
  });
}
