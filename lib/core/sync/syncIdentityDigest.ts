import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { compareSyncIdentityKey } from './syncIdentityKeyOrder.js';

export interface SyncIdentityState {
  content_hash: string;
  current_version_id: string | null;
  deleted_at: string | null;
  object_id: string;
  object_type: string;
}

export interface SyncIdentityEntry {
  fingerprint: string;
  object_id: string;
  repair_required?: boolean;
  object_type: string;
}

const encoder = new TextEncoder();

export function syncIdentityPartition(objectType: string, objectId: string) {
  return sha256(encoder.encode(JSON.stringify([objectType, objectId])))[0]!;
}

export function syncIdentityFingerprint(state: SyncIdentityState) {
  return bytesToHex(sha256(encoder.encode(JSON.stringify([
    state.content_hash, state.current_version_id, state.deleted_at
  ]))));
}

export function createSyncIdentityDigest() {
  const digest = sha256.create();
  let previous: SyncIdentityEntry | undefined;
  return {
    add(entry: SyncIdentityEntry) {
      if (previous && compareSyncIdentityKey(previous, entry) >= 0) {
        throw new Error('sync_identity_partition_order_invalid');
      }
      digest.update(encoder.encode(`${JSON.stringify([
        entry.object_type, entry.object_id, entry.fingerprint
      ])}\n`));
      previous = entry;
    },
    finish: () => bytesToHex(digest.digest())
  };
}

/** Entries must be ordered by object type, then object ID. */
export function syncIdentityPartitionDigest(entries: readonly SyncIdentityEntry[]) {
  const digest = createSyncIdentityDigest();
  for (const entry of entries) digest.add(entry);
  return digest.finish();
}
