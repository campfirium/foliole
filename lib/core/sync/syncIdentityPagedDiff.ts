import { createSyncIdentityDigest, type SyncIdentityEntry } from './syncIdentityDigest.js';
import { compareSyncIdentityKey } from './syncIdentityKeyOrder.js';

export interface SyncIdentityInventory {
  digest: string;
  row_count: number;
}

export interface SyncIdentityGlobalPage {
  entries: SyncIdentityEntry[];
  nextAfter: { object_type: string; object_id: string } | null;
}

export type SyncIdentityGlobalPageReader = (
  after: SyncIdentityGlobalPage['nextAfter']
) => Promise<SyncIdentityGlobalPage>;

function validateInventory(inventory: SyncIdentityInventory) {
  if (!Number.isSafeInteger(inventory.row_count) || inventory.row_count < 0 ||
      !/^[a-f0-9]{64}$/u.test(inventory.digest)) {
    throw new Error('sync_identity_inventory_invalid');
  }
}

async function* scanInventory(inventory: SyncIdentityInventory,
  read: SyncIdentityGlobalPageReader) {
  validateInventory(inventory);
  const digest = createSyncIdentityDigest();
  let after: SyncIdentityGlobalPage['nextAfter'] = null;
  let count = 0;
  for (;;) {
    const page = await read(after);
    if (!page || !Array.isArray(page.entries) || page.entries.length > 128 ||
        page.entries.length === 0 && page.nextAfter !== null ||
        new TextEncoder().encode(JSON.stringify(page.entries)).length > 65536) {
      throw new Error('sync_identity_global_page_invalid');
    }
    for (const entry of page.entries) {
      if (!entry || !entry.object_type || !entry.object_id ||
          !/^[a-f0-9]{64}$/u.test(entry.fingerprint) ||
          after && compareSyncIdentityKey(after, entry) >= 0) {
        throw new Error('sync_identity_global_page_order_invalid');
      }
      digest.add(entry);
      after = { object_type: entry.object_type, object_id: entry.object_id };
      count += 1;
      if (count > inventory.row_count) throw new Error('sync_identity_global_page_count_invalid');
      yield entry;
    }
    if (page.nextAfter === null) break;
    if (!after || compareSyncIdentityKey(after, page.nextAfter) !== 0) {
      throw new Error('sync_identity_global_page_cursor_invalid');
    }
  }
  if (count !== inventory.row_count || digest.finish() !== inventory.digest) {
    throw new Error('sync_identity_global_inventory_mismatch');
  }
}

/** Compare two fixed source views in global ID order without retaining either inventory. */
export async function* diffSyncIdentityGlobalPages(
  source: SyncIdentityInventory, receiver: SyncIdentityInventory,
  readSource: SyncIdentityGlobalPageReader, readReceiver: SyncIdentityGlobalPageReader,
  requiresRepair: (left: SyncIdentityEntry, right: SyncIdentityEntry) => boolean = () => false
) {
  const left = scanInventory(source, readSource)[Symbol.asyncIterator]();
  const right = scanInventory(receiver, readReceiver)[Symbol.asyncIterator]();
  let fromSource = await left.next();
  let fromReceiver = await right.next();
  while (!fromSource.done || !fromReceiver.done) {
    const order = fromSource.done ? 1 : fromReceiver.done ? -1 :
      compareSyncIdentityKey(fromSource.value, fromReceiver.value);
    if (order < 0) {
      if (fromSource.done) throw new Error('sync_identity_global_page_invalid');
      yield { kind: 'source_only' as const, source: fromSource.value };
      fromSource = await left.next();
    } else if (order > 0) {
      if (fromReceiver.done) throw new Error('sync_identity_global_page_invalid');
      yield { kind: 'receiver_only' as const, receiver: fromReceiver.value };
      fromReceiver = await right.next();
    } else {
      if (fromSource.done || fromReceiver.done) {
        throw new Error('sync_identity_global_page_invalid');
      }
      if (fromSource.value.fingerprint !== fromReceiver.value.fingerprint ||
          requiresRepair(fromSource.value, fromReceiver.value)) {
        yield { kind: 'divergent' as const,
          source: fromSource.value, receiver: fromReceiver.value };
      }
      fromSource = await left.next();
      fromReceiver = await right.next();
    }
  }
}
