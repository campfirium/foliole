import type { DbPort } from '../sync/dbPort.js';

export const FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL = `INSERT INTO framed_sync_resource_availability
  (hash, available) VALUES (?, ?) ON CONFLICT(hash) DO UPDATE SET available = excluded.available
  WHERE framed_sync_resource_availability.available != excluded.available`;

export async function recordFramedSyncResourceAvailability(
  db: DbPort, hashes: readonly string[], available: boolean
) {
  const unique = [...new Set(hashes)];
  if (unique.some(hash => !/^[a-f0-9]{64}$/u.test(hash))) throw new Error('framed_sync_resource_hash_invalid');
  if (!unique.length) return;
  await db.transaction(async tx => {
    for (let offset = 0; offset < unique.length; offset += 128) {
      const batch = unique.slice(offset, offset + 128);
      const rows = await tx.query<{ hash: string; available: number }>(`SELECT hash, available
        FROM framed_sync_resource_availability WHERE hash IN (${batch.map(() => '?').join(',')})`, batch);
      const current = new Map(rows.map(row => [row.hash, row.available]));
      const changed = batch.filter(hash => current.get(hash) !== Number(available));
      if (!changed.length) continue;
      await tx.run(`INSERT INTO framed_sync_resource_availability (hash, available)
        VALUES ${changed.map(() => '(?, ?)').join(',')} ON CONFLICT(hash) DO UPDATE SET available = excluded.available
        WHERE framed_sync_resource_availability.available != excluded.available`, changed.flatMap(hash => [hash, Number(available)]));
    }
  });
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
