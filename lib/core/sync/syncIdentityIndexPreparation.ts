import type { DbPort } from './dbPort.js';
import { publishLocalNodePosition } from './nodeVersionMemberPositionPublish.js';
import { isEligibleSyncIdentityState } from './syncIdentityEligibility.js';
import { backfillSyncIdentityIndexPage, drainSyncIdentityDirtyPage,
  assertReadySyncIdentityIndex } from './syncIdentityIndexMaintenance.js';

/** Finish a bounded, restartable index build before a source view is published. */
export async function prepareReadySyncIdentityIndex(port: DbPort, options: { publishPositions?: boolean } = {}) {
  let after = '';
  for (;;) {
    const nodes = await port.query<{ id: string }>(`SELECT id FROM (
      SELECT id FROM nodes WHERE current_version_id IS NOT NULL
      UNION SELECT node_id AS id FROM node_sync_tombstones)
      WHERE id > ? ORDER BY id LIMIT 128`, [after]);
    if (options.publishPositions !== false) {
      for (const node of nodes) await port.transaction((tx) => publishLocalNodePosition(tx, node.id));
    }
    if (nodes.length < 128) break;
    after = nodes.at(-1)!.id;
  }
  for (;;) {
    const backfill = await backfillSyncIdentityIndexPage(port, isEligibleSyncIdentityState);
    if (!backfill.complete) continue;
    if (await drainSyncIdentityDirtyPage(port, isEligibleSyncIdentityState)) continue;
    try {
      await assertReadySyncIdentityIndex(port);
      return;
    } catch (error) {
      if (error instanceof Error && ['sync_identity_index_not_quiescent',
        'sync_identity_index_not_ready'].includes(error.message)) continue;
      throw error;
    }
  }
}
