import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';

const FIELDS = ['frontierFactIds', 'requiredRelationIds', 'reviewFactIds', 'resourceHashes', 'stateFactIds', 'versionStates'] as const;
const encoder = new TextEncoder();
const PART_BYTES = 384 * 1024;

/** Lists are divided into bounded pieces; a single object's metadata has no session-size ceiling. */
export function* requestSyncInventoryParts(entry: FramedSyncInventoryEntry): Generator<FramedSyncInventoryEntry> {
  const empty = () => ({ ...entry, frontierFactIds: [] as string[], requiredRelationIds: [] as string[],
    reviewFactIds: [] as string[], resourceHashes: [] as Uint8Array[], stateFactIds: [] as string[], versionStates: [] as string[] });
  let part = empty();
  let size = 0;
  let items = 0;
  for (const field of FIELDS) for (const value of entry[field] ?? []) {
    const bytes = typeof value === 'string' ? encoder.encode(value).length : value.length;
    if (size + bytes + 8 > PART_BYTES || items >= 2048) {
      yield part;
      part = empty(); size = 0; items = 0;
    }
    if (field === 'resourceHashes') part.resourceHashes.push(value as Uint8Array);
    else part[field].push(value as string);
    size += bytes + 8;
    items += 1;
  }
  yield part;
}

export function mergeRequestSyncInventoryPart(previous: FramedSyncInventoryEntry, next: FramedSyncInventoryEntry) {
  if (previous.objectType !== next.objectType || previous.globalId !== next.globalId ||
      previous.currentVersionId !== next.currentVersionId || previous.unready !== next.unready ||
      !previous.sharedStateHash.every((value, index) => next.sharedStateHash[index] === value)) {
    throw new Error('inventory_entry_part_identity_mismatch');
  }
  for (const field of FIELDS) {
    // The accumulating record is owned by this decoder, never by an inventory reader.
    const destination = previous[field];
    const source = next[field];
    if (!source?.length) continue;
    if (!destination) throw new Error('inventory_entry_part_shape_invalid');
    if (field === 'resourceHashes') for (const item of source) (destination as Uint8Array[]).push(item as Uint8Array);
    else for (const item of source) (destination as string[]).push(item as string);
  }
}

export function completeRequestSyncInventoryEntry(entry: FramedSyncInventoryEntry) {
  for (const field of FIELDS) {
    const values = entry[field] ?? [];
    const identities = values.map(value => typeof value === 'string' ? value : [...value].join(','));
    if (new Set(identities).size !== values.length) throw new Error('inventory_entry_part_duplicate');
  }
  return entry;
}
