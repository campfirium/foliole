// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { FRAMED_SYNC_RECEIPT_RETENTION_MS } from '../../lib/core/sync/framedSyncCompletionRetention.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { prepareDesktopFramedSyncPublishedDelivery } from './desktopFramedSyncProcessOutbound.js';
import { publicationEvidence, publishFixtureDelivery } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence } from './desktopFramedSyncTwoProcess.testSupport.js';

it('handles an old request after receipt expiry without extra versions or replacing a newer edit', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let delayed: Awaited<ReturnType<typeof captureIssuedBody>> | undefined;
  try {
    const nodeId = 't326-expired-receipt';
    await fixture.left.seed({ content: 'Original', nodeId, title: 'Original' });
    const transferId = await publishFixtureDelivery(fixture.left, fixture.rightSnapshot, 'finalised');
    delayed = await captureIssuedBody(fixture.leftSnapshot.databasePath, transferId);
    await fixture.left.invoke('round', { input: { kind: 'send', transferId } });
    await fixture.right.seed({ content: 'Newer receiver edit', nodeId, title: 'Newer' });
    const before = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
    expect(await fixture.right.invoke('round', { input: {
      kind: 'expire_completions', now: Date.now() + FRAMED_SYNC_RECEIPT_RETENTION_MS + 1000
    } })).toBeGreaterThan(0);
    expect(publicationEvidence(fixture.rightSnapshot.databasePath).receipts).toEqual([]);
    const reply = await postDesktopFramedSync({ body: delayed,
      endpointUrl: fixture.rightSnapshot.origin, groupId: 't326-group',
      localDeviceId: 'desktop-a', localLibraryEpoch: 'desktop-a-epoch',
      remoteDeviceId: 'desktop-b', remoteLibraryEpoch: 'desktop-b-epoch',
      pathWithQuery: '/companion/framed-sync', secret: Buffer.alloc(32, 7).toString('base64url') });
    for await (const frame of reply.stream.frames) expect(frame.ciphertext.byteLength).toBeGreaterThan(0);
    const after = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.versions).toEqual(before.versions);
    expect(after.parents).toEqual(before.parents);
    expect(after.reviews).toEqual(before.reviews);
    expect(after.framedSync.inboundFrames).toBe(0);
    expect(after.framedSync.inboundFacts).toBe(0);
    expect(after.framedSync.availableBlobs).toBe(0);
  } finally {
    await delayed?.dispose?.();
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 120_000);

async function captureIssuedBody(databasePath: string, transferId: string) {
  const sqlite = new Database(databasePath, { fileMustExist: true });
  try {
    const db = createBetterSqliteDbPort(sqlite);
    const staging = createDesktopFramedSyncStaging(db);
    const publication = await staging.loadOutboundPublication(Buffer.from(transferId, 'hex'));
    if (!publication) throw new Error('issued_publication_missing');
    return (await prepareDesktopFramedSyncPublishedDelivery({ db, staging, publication,
      groupSecret: Buffer.alloc(32, 7).toString('base64url') })).body;
  } finally { sqlite.close(); }
}
