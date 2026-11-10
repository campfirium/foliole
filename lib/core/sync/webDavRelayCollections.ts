import { z } from 'zod';

import { attachmentBlockResourceSchema } from './attachmentBlockReceiver.js';
import type { DbPort } from './dbPort.js';
import { webDavRelayStatus, type WebDavRelayRequest } from './webDavRelayPublication.js';

export const relayGeneration = z.uuid();
export const relayCollectionOffer = z.object({
  generation: z.union([relayGeneration, z.literal('legacy')]),
  keys: z.array(attachmentBlockResourceSchema.shape.storageKey)
});
export type RelayCollectionOffer = z.infer<typeof relayCollectionOffer>;

const collectionState = z.object({
  active: relayGeneration,
  startSequence: z.number().int().nonnegative(),
  keys: relayCollectionOffer.shape.keys,
  retired: relayCollectionOffer.nullable()
});
type CollectionState = z.infer<typeof collectionState>;

export function relayGenerationRoot(direction: URL) {
  const root = new URL(direction);
  root.pathname = root.pathname.replace(/\/$/u, '-collections/');
  return root;
}

export function relayCollectionUrl(direction: URL, generation: RelayCollectionOffer['generation']) {
  return generation === 'legacy' ? direction : new URL(`${relayGeneration.parse(generation)}/`, relayGenerationRoot(direction));
}

export async function readRelayCollections(db: DbPort, key: string) {
  const [row] = await db.query<{ value: string }>('SELECT value FROM sync_group_metadata WHERE key = ?', [`${key}:collections`]);
  return row ? collectionState.parse(JSON.parse(row.value)) : null;
}

export async function writeRelayCollections(db: DbPort, key: string, value: CollectionState) {
  await db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [`${key}:collections`, JSON.stringify(value), new Date().toISOString()]);
}

export async function recordRelayCollectionAttachment(db: DbPort, key: string, storageKey: string) {
  const state = await readRelayCollections(db, key);
  if (state && !state.keys.includes(storageKey)) {
    await writeRelayCollections(db, key, { ...state, keys: [...state.keys, storageKey] });
  }
}

export async function ensureWebDavCollection(request: WebDavRelayRequest, directory: URL) {
  const probe = () => request(directory, { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus);
  const existing = await probe();
  if (existing === 207) return;
  if (existing !== 404) throw new Error(`webdav_relay_collection_failed:${existing}`);
  const created = await request(directory, { method: 'MKCOL' }, webDavRelayStatus);
  if (created === 201 || (created === 405 && await probe() === 207)) return;
  throw new Error(`webdav_relay_collection_failed:${created}`);
}
