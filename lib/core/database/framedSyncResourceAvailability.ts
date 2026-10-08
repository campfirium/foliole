import type { DbPort } from '../sync/dbPort.js';

export const FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL = `INSERT INTO framed_sync_resource_availability
  (hash, available) VALUES (?, ?) ON CONFLICT(hash) DO UPDATE SET available = excluded.available
  WHERE framed_sync_resource_availability.available != excluded.available`;

export async function recordFramedSyncResourceAvailability(
  db: DbPort, hashes: readonly string[], available: boolean
) {
  for (const hash of new Set(hashes)) {
    if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error('framed_sync_resource_hash_invalid');
    await db.run(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL, [hash, available ? 1 : 0]);
  }
}

/** Ready resource pins exist only after the attachment bytes have been verified and promoted. */
export async function recordFramedSyncPinnedResourceAvailability(
  db: DbPort, transferIds: readonly Uint8Array[]
) {
  for (const transferId of transferIds) {
    const rows = await db.query<{ hash: string }>(`SELECT lower(hex(sha256)) AS hash
      FROM framed_sync_resource_pins WHERE transfer_id = ? AND role IN (2, 3, 4)`, [transferId]);
    await recordFramedSyncResourceAvailability(db, rows.map((row) => row.hash), true);
  }
}

/** Called only by the formal index migration, after the host inventories its existing files. */
export async function initializeFramedSyncResourceAvailability(db: DbPort, storageKeys: readonly string[]) {
  const hashes = storageKeys.map((key) => {
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/u.test(key)) throw new Error('framed_sync_resource_storage_key_invalid');
    return key.slice(0, 64);
  });
  await recordFramedSyncResourceAvailability(db, hashes, true);
}
