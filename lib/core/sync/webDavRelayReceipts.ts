import type { DbPort } from './dbPort.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';

const RECEIPT_BATCH_SIZE = 256;

type RelayPacketIdentity = { generation: string; name: string };
const receiptPrefix = (scope: WebDavRelayBodyScope) => `${scope.key}:applied:`;
const receiptKey = (scope: WebDavRelayBodyScope, packet: RelayPacketIdentity) =>
  `${receiptPrefix(scope)}${packet.generation}:${packet.name}`;

export async function readUnappliedRelayPackets<T extends RelayPacketIdentity>(
  db: DbPort, scope: WebDavRelayBodyScope, packets: readonly T[]
) {
  const pending: T[] = [];
  for (let offset = 0; offset < packets.length; offset += RECEIPT_BATCH_SIZE) {
    const candidates = packets.slice(offset, offset + RECEIPT_BATCH_SIZE).map(packet => ({
      packet, key: receiptKey(scope, packet), oldKey: receiptPrefix(scope) + packet.name
    }));
    // Old libraries recorded only the name. An exact lookup still honors those receipts.
    const rows = await db.query<{ key: string }>(`SELECT key FROM sync_group_metadata
      WHERE key IN (SELECT value FROM json_each(?))`, [JSON.stringify(candidates.flatMap(({ key, oldKey }) => [key, oldKey]))]);
    const applied = new Set(rows.map(row => row.key));
    for (const { packet, key, oldKey } of candidates) {
      if (!applied.has(key) && !applied.has(oldKey)) pending.push(packet);
    }
  }
  return pending;
}

export function recordRelayPacketReceipt(db: DbPort, scope: WebDavRelayBodyScope, packet: RelayPacketIdentity, damaged = false) {
  return db.run('INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
    [receiptKey(scope, packet), damaged ? 'damaged' : 'true', new Date().toISOString()]);
}

export function removeRelayCollectionReceipts(db: DbPort, scope: WebDavRelayBodyScope, generation: string) {
  const prefix = receiptPrefix(scope) + generation;
  return db.run('DELETE FROM sync_group_metadata WHERE key >= ? AND key < ?', [prefix + ':', prefix + ';']);
}
