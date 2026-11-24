import type { DbPort } from './dbPort.js';
import type { RelayCollectionOffer } from './webDavRelayCollections.js';

export type WebDavRelayPacketIdentity = { name: string; generation: RelayCollectionOffer['generation'] };

const RECEIPT_LOOKUP_BATCH = 128;
const receiptPrefix = (scopeKey: string) => `${scopeKey}:applied:`;
const receiptValue = (generation: WebDavRelayPacketIdentity['generation'], damaged: boolean) =>
  `${generation}:${damaged ? 'damaged' : 'true'}`;

export async function readWebDavRelayPacketReceipts(db: DbPort, scopeKey: string, packets: readonly WebDavRelayPacketIdentity[]) {
  const prefix = receiptPrefix(scopeKey);
  const applied = new Set<string>();
  for (let offset = 0; offset < packets.length; offset += RECEIPT_LOOKUP_BATCH) {
    const keys = packets.slice(offset, offset + RECEIPT_LOOKUP_BATCH).map(({ name }) => prefix + name);
    const rows = await db.query<{ key: string }>(
      `SELECT key FROM sync_group_metadata WHERE key IN (${keys.map(() => '?').join(',')})`, keys);
    for (const { key } of rows) applied.add(key.slice(prefix.length));
  }
  return applied;
}

export function recordWebDavRelayPacketReceipt(db: DbPort, scopeKey: string, packet: WebDavRelayPacketIdentity, damaged = false) {
  return db.run('INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
    [receiptPrefix(scopeKey) + packet.name, receiptValue(packet.generation, damaged), new Date().toISOString()]);
}

export function pruneWebDavRelayPacketReceipts(db: DbPort, scopeKey: string, generation: WebDavRelayPacketIdentity['generation']) {
  // Older receipts do not identify their collection. Keep them available for exact-name deduplication.
  return db.run(`DELETE FROM sync_group_metadata WHERE key >= ? AND key < ? AND value IN (?, ?)`,
    [receiptPrefix(scopeKey), `${scopeKey}:applied;`, receiptValue(generation, false), receiptValue(generation, true)]);
}
