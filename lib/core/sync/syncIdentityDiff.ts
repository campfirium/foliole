import {
  createSyncIdentityDigest, syncIdentityPartition, syncIdentityPartitionDigest,
  type SyncIdentityEntry
} from './syncIdentityDigest.js';
import { compareSyncIdentityKey } from './syncIdentityKeyOrder.js';

export interface SyncIdentitySummaryRow {
  digest: string;
  partition: number;
  row_count: number;
}

export interface SyncIdentityPage {
  entries: SyncIdentityEntry[];
  nextAfter: { object_type: string; object_id: string } | null;
}

export type SyncIdentityPageReader = (partition: number,
  after: { object_type: string; object_id: string } | null) => Promise<SyncIdentityPage>;

function validateSummary(rows: readonly SyncIdentitySummaryRow[]) {
  if (rows.length !== 256 || rows.some((row, partition) => row.partition !== partition ||
      !Number.isSafeInteger(row.row_count) || row.row_count < 0 ||
      !/^[a-f0-9]{64}$/.test(row.digest))) throw new Error('sync_identity_summary_invalid');
}

async function* scanPartition(summary: SyncIdentitySummaryRow, read: SyncIdentityPageReader) {
  const digest = createSyncIdentityDigest();
  let after: SyncIdentityPage['nextAfter'] = null;
  let count = 0;
  for (;;) {
    const page = await read(summary.partition, after);
    if (page.entries.length > 128 || page.entries.length === 0 && page.nextAfter !== null) {
      throw new Error('sync_identity_page_invalid');
    }
    const bytes = new TextEncoder().encode(JSON.stringify(page.entries)).length;
    if (bytes > 65536) throw new Error('sync_identity_page_too_large');
    for (const entry of page.entries) {
      if (syncIdentityPartition(entry.object_type, entry.object_id) !== summary.partition ||
          after && compareSyncIdentityKey(after, entry) >= 0) {
        throw new Error('sync_identity_page_order_invalid');
      }
      digest.add(entry);
      after = { object_type: entry.object_type, object_id: entry.object_id };
      count += 1;
      if (count > summary.row_count) throw new Error('sync_identity_page_count_invalid');
      yield entry;
    }
    if (page.nextAfter === null) break;
    if (!after || compareSyncIdentityKey(after, page.nextAfter) !== 0) {
      throw new Error('sync_identity_page_cursor_invalid');
    }
  }
  if (count !== summary.row_count || digest.finish() !== summary.digest) {
    throw new Error('sync_identity_partition_digest_mismatch');
  }
}

/** Stage yielded differences until both partition streams have passed digest validation. */
export async function* diffSyncIdentitySummaries(
  source: readonly SyncIdentitySummaryRow[], receiver: readonly SyncIdentitySummaryRow[],
  readSource: SyncIdentityPageReader, readReceiver: SyncIdentityPageReader
) {
  validateSummary(source);
  validateSummary(receiver);
  for (let partition = 0; partition < 256; partition += 1) {
    const left = source[partition]!;
    const right = receiver[partition]!;
    if (left.digest === right.digest) {
      if (left.row_count !== right.row_count) throw new Error('sync_identity_summary_invalid');
      continue;
    }
    const sourceRows = scanPartition(left, readSource)[Symbol.asyncIterator]();
    const receiverRows = scanPartition(right, readReceiver)[Symbol.asyncIterator]();
    let fromSource = await sourceRows.next();
    let fromReceiver = await receiverRows.next();
    while (!fromSource.done || !fromReceiver.done) {
      const order = fromSource.done ? 1 : fromReceiver.done ? -1 :
        compareSyncIdentityKey(fromSource.value, fromReceiver.value);
      if (order < 0) {
        if (fromSource.done) throw new Error('sync_identity_page_invalid');
        yield { kind: 'source_only' as const, partition, source: fromSource.value };
        fromSource = await sourceRows.next();
      } else if (order > 0) {
        if (fromReceiver.done) throw new Error('sync_identity_page_invalid');
        yield { kind: 'receiver_only' as const, partition, receiver: fromReceiver.value };
        fromReceiver = await receiverRows.next();
      } else {
        if (fromSource.done || fromReceiver.done) throw new Error('sync_identity_page_invalid');
        if (fromSource.value.fingerprint !== fromReceiver.value.fingerprint) {
          yield { kind: 'divergent' as const, partition,
            source: fromSource.value, receiver: fromReceiver.value };
        }
        fromSource = await sourceRows.next();
        fromReceiver = await receiverRows.next();
      }
    }
  }
}

export function emptySyncIdentitySummary() {
  const digest = syncIdentityPartitionDigest([]);
  return Array.from({ length: 256 }, (_, partition) => ({ partition, digest, row_count: 0 }));
}
