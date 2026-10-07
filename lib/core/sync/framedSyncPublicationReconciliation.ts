import { readFramedSyncPublication, readFramedSyncRow } from '../database/framedSyncStagingSerialization.js';

import type { DbPort } from './dbPort.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { recoverLegacyPublicationInventory } from './framedSyncLegacyPublicationInventory.js';
import { recheckPublicationInventory } from './framedSyncPublicationInventory.js';

export async function reconcileFramedSyncPublication(db: DbPort, transferId: Uint8Array,
  remote: readonly FramedSyncInventoryEntry[]) {
  return db.transaction(async (tx) => {
    const row = await readFramedSyncRow(tx,
      'SELECT * FROM framed_sync_outbound_publications WHERE transfer_id = ?', [transferId]);
    if (!row) throw new Error('framed_sync_outbound_publication_missing');
    if (row.state === 'receipt_committed') return 'satisfied' as const;
    const publication = readFramedSyncPublication(row);
    const original = publication.inventoryDifference ?? recoverLegacyPublicationInventory(publication.manifest);
    if (recheckPublicationInventory(original, remote)) return 'missing' as const;
    await tx.run(`UPDATE framed_sync_outbound_publications SET state = 'receipt_committed'
      WHERE transfer_id = ? AND state = 'published'`, [transferId]);
    await tx.run('DELETE FROM framed_sync_outbound_holds WHERE transfer_id = ?', [transferId]);
    await tx.run(`DELETE FROM framed_sync_outbound_attempts
      WHERE transfer_id = ? AND purpose = 'transfer'`, [transferId]);
    return 'satisfied' as const;
  });
}
