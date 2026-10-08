import { verifyStoredContentBlobBytes,
  type StoredContentBlobMeta } from '../../../../../lib/core/sync/storedContentBlobIntegrity.js';
import { RESOURCE_AVAILABILITY_BATCH_LIMIT } from '../../../../../lib/platform/resourceAvailabilityContract.js';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap.js';

/** Missing bytes retain their existing download path; cached bytes must match their manifest. */
export async function verifyCompanionSyncIdentityBlobBytes() {
  let after = '';
  for (;;) {
    const rows = await getIosCompanionDatabaseOwner().read((port) =>
      port.query<StoredContentBlobMeta>(`SELECT blob.hash, blob.stored_sha256, blob.stored_size_bytes
        FROM content_blobs blob JOIN content_blob_data data ON data.hash = blob.hash
        WHERE blob.kind = 'text_body' AND blob.hash > ?
        ORDER BY blob.hash LIMIT ?`, [after, RESOURCE_AVAILABILITY_BATCH_LIMIT]));
    if (!rows.length) return;
    for (const row of rows) {
      const valid = await getIosCompanionDatabaseOwner().read((port) =>
        verifyStoredContentBlobBytes(port, row));
      if (!valid) throw new Error('sync_group_resources_incomplete');
    }
    after = rows.at(-1)!.hash;
  }
}
