// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { readDesktopFramedSyncLibraryEvidence } from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { compareFramedSyncInventories } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { pushRequestSyncObject } from '../../../../../../lib/core/sync/requestSyncDatabaseExchange.js';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';

import { currentCompanionRequestSyncDatabaseHost } from './companionRequestSyncDatabaseHost.js';
import { createCompanionRequestSyncExchange } from './companionRequestSyncExchange.js';

let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
beforeEach(async () => { host = await createCompanionRequestFixture(); }, 20000);
afterEach(async () => { await host?.close(); host = undefined; });

it('retains a review with a missing receiver node, delivers independent work and retries after reopening', async () => {
  if (!host) throw new Error('companion_request_fixture_not_initialized');
  const { fixture } = host;
  await fixture.left.seedRelationReview('sender');
  await host.sync();
  const original = host.sqlite.prepare('SELECT * FROM review_log WHERE op_id = ?').get('t326-review-op');
  expect(original).toMatchObject({ node_id: 't326-relation-review', op_id: 't326-review-op', grade: 3 });

  const receiver = new Database(fixture.rightSnapshot.databasePath);
  try {
    receiver.pragma('foreign_keys = OFF');
    receiver.prepare('DELETE FROM review_log WHERE op_id = ?').run('t326-review-op');
    receiver.prepare('DELETE FROM nodes WHERE id = ?').run('t326-relation-review');
  } finally { receiver.close(); }
  await fixture.left.seed({ content: 'Independent body', nodeId: 't326-independent', title: 'Independent' });

  await expect(sendReviewOnly(host)).rejects.toThrow('framed_sync_review_node_missing:t326-relation-review');
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).reviews).toEqual([]);
  expect(host.sqlite.prepare('SELECT * FROM review_log WHERE op_id = ?').get('t326-review-op')).toEqual(original);

  await host.restart();
  expect(host.sqlite.prepare('SELECT * FROM review_log WHERE op_id = ?').get('t326-review-op')).toEqual(original);
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes)
    .toContainEqual(expect.objectContaining({ id: 't326-independent', content: 'Independent body' }));
  for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
    const reopened = new Database(snapshot.databasePath, { readonly: true });
    try {
      expect(reopened.prepare('SELECT * FROM review_log WHERE op_id = ?').get('t326-review-op')).toEqual(original);
      expect(reopened.prepare('SELECT count(*) FROM review_log WHERE op_id = ?').pluck().get('t326-review-op')).toBe(1);
    } finally { reopened.close(); }
  }
}, 20000);

async function sendReviewOnly(host: Awaited<ReturnType<typeof createCompanionRequestFixture>>) {
  const { fixture } = host;
  const difference = compareFramedSyncInventories({ local: await readFramedSyncInventory(host.db), remote: [] })
    .find(entry => entry.globalId === 't326-relation-review')!;
  const database = await currentCompanionRequestSyncDatabaseHost();
  const exchange = createCompanionRequestSyncExchange(database, {
    endpointUrl: fixture.rightSnapshot.origin, groupKey: new Uint8Array(32).fill(7),
    context: { groupId: 't326-group', protocolVersion: 24,
      initiatorDeviceId: fixture.leftSnapshot.deviceId,
      initiatorLibraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
      responderDeviceId: fixture.rightSnapshot.deviceId,
      responderLibraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch` }
  });
  return pushRequestSyncObject(database, exchange, { ...difference,
    need: { sharedState: false, frontierFactIds: [], requiredRelationIds: [], resourceHashes: [],
      stateFactIds: [], reviewFactIds: ['t326-review-op'] } });
}
