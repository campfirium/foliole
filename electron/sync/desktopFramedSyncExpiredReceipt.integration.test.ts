// @vitest-environment node
import { promises as fs } from 'node:fs';

import { expect, it } from 'vitest';

import { FRAMED_SYNC_RECEIPT_RETENTION_MS } from '../../lib/core/sync/framedSyncCompletionRetention.js';

import { publicationEvidence, publishFixtureDelivery } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence } from './desktopFramedSyncTwoProcess.testSupport.js';

it('handles an old request after receipt expiry without extra versions or replacing a newer edit', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    const nodeId = 't326-expired-receipt';
    await fixture.left.seed({ content: 'Original', nodeId, title: 'Original' });
    const transferId = await publishFixtureDelivery(fixture.left, fixture.rightSnapshot, 'publication');
    await fixture.left.invoke('round', { input: { kind: 'send', transferId } });
    await fixture.right.seed({ content: 'Newer receiver edit', nodeId, title: 'Newer' });
    const before = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
    expect(await fixture.right.invoke('round', { input: {
      kind: 'expire_completions', now: Date.now() + FRAMED_SYNC_RECEIPT_RETENTION_MS + 1000
    } })).toBeGreaterThan(0);
    expect(publicationEvidence(fixture.rightSnapshot.databasePath).receipts).toEqual([]);
    // The cached original input represents a delayed, already-issued request.
    await fixture.left.invoke('round', { input: { kind: 'publish', transferId } });
    await fixture.left.invoke('round', { input: { kind: 'send', transferId } });
    const after = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.versions).toEqual(before.versions);
    expect(after.parents).toEqual(before.parents);
    expect(after.reviews).toEqual(before.reviews);
    expect(after.framedSync.inboundFrames).toBe(0);
    expect(after.framedSync.inboundFacts).toBe(0);
    expect(after.framedSync.availableBlobs).toBe(0);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 120_000);
