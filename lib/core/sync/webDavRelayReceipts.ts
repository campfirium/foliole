import type { DbPort } from './dbPort.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';

const RECEIPT_BATCH_SIZE = 256;

type RelayPacketIdentity = { generation: string; name: string; kind: string | undefined };
const receiptPrefix = (scope: WebDavRelayBodyScope) => `${scope.key}:applied:`;
const receiptKey = (scope: WebDavRelayBodyScope, packet: RelayPacketIdentity) =>
  `${receiptPrefix(scope)}${packet.generation}:${packet.name}`;
const cleanupPrefix = (scope: WebDavRelayBodyScope) => `${scope.key}:incoming-cleanup:`;
const generationReceiptRange = (scope: WebDavRelayBodyScope, generation: string) => {
  const prefix = receiptPrefix(scope) + generation;
  return [prefix + ':', prefix + ';'];
};

export async function readUnappliedRelayPackets<T extends RelayPacketIdentity>(
  db: DbPort, scope: WebDavRelayBodyScope, packets: readonly T[]
) {
  const pending: T[] = [];
  for (let offset = 0; offset < packets.length; offset += RECEIPT_BATCH_SIZE) {
    const candidates = packets.slice(offset, offset + RECEIPT_BATCH_SIZE).map(packet => ({
      packet, key: receiptKey(scope, packet),
      // Old repair receipts could acknowledge a request without queueing its file.
      oldKey: packet.kind === 'repair' ? undefined : receiptPrefix(scope) + packet.name
    }));
    const rows = await db.query<{ key: string }>(`SELECT key FROM sync_group_metadata
      WHERE key IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(candidates.flatMap(({ key, oldKey }) => oldKey ? [key, oldKey] : [key]))]);
    const applied = new Set(rows.map(row => row.key));
    for (const { packet, key, oldKey } of candidates) {
      if (!applied.has(key) && (!oldKey || !applied.has(oldKey))) pending.push(packet);
    }
  }
  return pending;
}

export function recordRelayPacketReceipt(db: DbPort, scope: WebDavRelayBodyScope, packet: RelayPacketIdentity, damaged = false) {
  return db.run('INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
    [receiptKey(scope, packet), damaged ? 'damaged' : 'true', new Date().toISOString()]);
}

export async function hasRelayCollectionReceipts(db: DbPort, scope: WebDavRelayBodyScope, generation: string) {
  return (await db.query('SELECT 1 FROM sync_group_metadata WHERE key >= ? AND key < ? LIMIT 1',
    generationReceiptRange(scope, generation))).length > 0;
}

export function rememberRelayCollectionCleanup(db: DbPort, scope: WebDavRelayBodyScope, generation: string) {
  return db.run(`INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at)
    SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM sync_group_metadata WHERE key >= ? AND key < ?)`,
  [cleanupPrefix(scope) + generation, generation, new Date().toISOString(), ...generationReceiptRange(scope, generation)]);
}

export async function readMissingRelayReceiptGenerations(db: DbPort, scope: WebDavRelayBodyScope, present: ReadonlySet<string>) {
  const rows = await db.query<{ value: string }>('SELECT value FROM sync_group_metadata WHERE key >= ? AND key < ?',
    [cleanupPrefix(scope), `${scope.key}:incoming-cleanup;`]);
  return rows.map(row => row.value).filter(generation => !present.has(generation));
}

export async function removeRelayCollectionReceipts(db: DbPort, scope: WebDavRelayBodyScope, generation: string) {
  await db.run('DELETE FROM sync_group_metadata WHERE key >= ? AND key < ?', generationReceiptRange(scope, generation));
  await db.run('DELETE FROM sync_group_metadata WHERE key = ?', [cleanupPrefix(scope) + generation]);
}
