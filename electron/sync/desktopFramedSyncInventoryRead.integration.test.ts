// @vitest-environment node
import { expect, it } from 'vitest';

import { readFramedSyncInventory, readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { compareSyncIdentityText } from '../../lib/core/sync/syncIdentityKeyOrder.js';
import { textDevice } from '../database/topicTextState.testSupport.js';

it('reads every mixed identity and its exact dependency lists, including later shared settings', async () => {
  const host = textDevice();
  try {
    const expected = await readFramedSyncInventory(host.db);
    const hash = '7'.repeat(64);
    for (let index = 0; index < 300; index += 1) {
      const id = `inventory-${String(index).padStart(4, '0')}`;
      const entry = { globalId: id, objectType: 'node', frontierFactIds: [`version-${id}`],
        requiredRelationIds: [], reviewFactIds: [`review-${id}`], stateFactIds: [`state-${id}`],
        resourceHashes: [new Uint8Array(32).fill(0x77)], sharedStateHash: new Uint8Array(32).fill(0x77) };
      await host.db.run(`INSERT INTO framed_sync_inventory VALUES ('node', ?, ?, ?, '[]', ?, ?, ?)`,
        [id, hash, JSON.stringify(entry.frontierFactIds), JSON.stringify(entry.reviewFactIds),
          JSON.stringify(entry.stateFactIds), JSON.stringify([hash])]);
      expected.push(entry);
      for (const type of ['node_position', 'order_version', 'setting']) {
        const stateId = type === 'setting' ? `user_space:a:desktop:*:unknown-${id}` : `state-${id}`;
        await host.db.run(`INSERT INTO sync_object_state
          (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
          SELECT ?, ?, COALESCE(MAX(state_seq), 0) + 1, ?, 'fixture', '2026-10-10' FROM sync_object_state`,
        [type, stateId, hash]);
        if (type !== 'setting') expected.push({ globalId: stateId, objectType: type,
          frontierFactIds: [], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
          sharedStateHash: new Uint8Array(32).fill(0x77), stateFactIds: [`${type}:${hash}`] });
      }
    }
    const settingId = 'user_space:z:desktop:*:review_scheduler_settings';
    await host.db.run(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
      SELECT 'setting', ?, COALESCE(MAX(state_seq), 0) + 1, ?, 'fixture', '2026-10-10' FROM sync_object_state`,
    [settingId, hash]);
    expected.push({ globalId: settingId, objectType: 'setting', frontierFactIds: [], requiredRelationIds: [],
      reviewFactIds: [], resourceHashes: [], sharedStateHash: new Uint8Array(32).fill(0x77), stateFactIds: [`setting:${hash}`] });
    expected.sort((a, b) => compareSyncIdentityText(a.objectType, b.objectType) || compareSyncIdentityText(a.globalId, b.globalId));
    expect(await readFramedSyncInventory(host.db)).toEqual(expected);
    for (const value of [expected[0]!, expected[Math.floor(expected.length / 2)]!, expected.at(-1)!]) {
      expect(await readFramedSyncInventoryEntry(host.db, value)).toEqual(value);
    }
  } finally { host.sqlite.close(); }
});
