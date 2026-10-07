// @vitest-environment node
import { expect, it } from 'vitest';

import { port, setupVersionCollectionFixture, sqlite } from '../../../../../../electron/database/nodeVersionPayloadCollector.testSupport.js';
import { restoreFramedSyncObjectStateFact, selectFramedSyncObjectStateFact } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { framedSyncObjectStateFactId } from '../../../../../../lib/core/sync/framedSyncObjectStateInventory.js';
import { parentOrderFactStateStatement } from '../../../../../../lib/core/sync/syncParentOrderFact.js';
import { insertParentOrderVersion } from '../../../../../../lib/core/sync/syncParentOrderVersionStore.js';

import { applyPreparedCompanionFramedSyncTransfers } from './companionFramedSyncApplyPrepared.js';

setupVersionCollectionFixture();

it('restores the identical order body under an existing receipt without changing that receipt', async () => {
  const version = { versionId: 'order', kind: 'membership' as const, order: ['node'], parentVersionIds: [] };
  await insertParentOrderVersion(port, 'folder', version, 'now');
  const hash = parentOrderFactStateStatement('folder', version, 'now').params[1] as string;
  const fact = await selectFramedSyncObjectStateFact(port, { globalId: 'order', objectType: 'order_version' },
    framedSyncObjectStateFactId('order_version', hash, null));
  const record = restoreFramedSyncObjectStateFact(fact);
  const transfer = { contentId: new Uint8Array(32).fill(2),
    decoded: { globalId: 'order', objectType: 'order_version', nodes: [], relationReviewFacts: [], readingStates: [record] },
    input: { receiverDeviceId: 'local', receiverLibraryEpoch: 'epoch', senderDeviceId: 'remote',
      senderLibraryEpoch: 'other', stagingKind: 'android' as const, stagingPath: 'unused',
      transferId: new Uint8Array(32).fill(1) } };
  const [receipt] = await applyPreparedCompanionFramedSyncTransfers(port, [transfer]);
  sqlite.prepare("UPDATE parent_order_versions SET child_ids_json = 'null' WHERE version_id = 'order'").run();
  expect(await applyPreparedCompanionFramedSyncTransfers(port, [transfer])).toEqual([receipt]);
  expect(sqlite.prepare('SELECT child_ids_json FROM parent_order_versions WHERE version_id = ?').pluck().get('order'))
    .toBe('["node"]');
  sqlite.prepare("UPDATE parent_order_versions SET child_ids_json = 'null' WHERE version_id = 'order'").run();
  await expect(applyPreparedCompanionFramedSyncTransfers(port,
    [{ ...transfer, contentId: new Uint8Array(32).fill(3) }])).rejects.toThrow('receipt_identity_conflict');
  expect(sqlite.prepare('SELECT child_ids_json FROM parent_order_versions WHERE version_id = ?').pluck().get('order'))
    .toBe('null');
});
