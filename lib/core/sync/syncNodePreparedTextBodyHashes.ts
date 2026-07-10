import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import {
  hashTextBodyContent,
  type TextBodyHashOptions
} from './syncNodeTextBodyBlobs.js';

export async function prepareSyncNodeTextBodyHashes(
  records: NativeSyncNodeRecord[],
  options: TextBodyHashOptions
) {
  const prepared = new Map<NativeSyncNodeRecord, string>();
  for (const record of records) {
    if (record.snapshot.body_blob_hash) continue;
    prepared.set(record, await hashTextBodyContent(record.snapshot.content ?? '', options));
  }
  return prepared;
}
