import { createHash } from 'node:crypto';

import type { DbRow } from '../../lib/core/sync/dbPort.js';
import { verifyStoredContentBlobBytes } from '../../lib/core/sync/storedContentBlobIntegrity.js';
import { CONTENT_BLOB_BATCH_MAX_BYTES,
  RESOURCE_AVAILABILITY_BATCH_LIMIT } from '../../lib/platform/resourceAvailabilityContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { downloadDesktopSyncGroupResources } from './desktopSyncGroupResources.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

interface BlobMeta extends DbRow { hash: string; stored_sha256: string; stored_size_bytes: number }

async function readBlobPage(after: string) {
  return runWithDatabaseConnectionOwner(() => createBetterSqliteDbPort(
    openDatabaseConnection().sqlite).query<BlobMeta>(`SELECT hash, stored_sha256, stored_size_bytes
      FROM content_blobs WHERE hash > ? ORDER BY hash LIMIT ?`,
  [after, RESOURCE_AVAILABILITY_BATCH_LIMIT]));
}

async function blobBytesValid(row: BlobMeta) {
  if (!Number.isSafeInteger(row.stored_size_bytes) || row.stored_size_bytes < 0) {
    throw new Error('content_blob_batch_row_exceeds_budget');
  }
  if (row.stored_size_bytes > CONTENT_BLOB_BATCH_MAX_BYTES) {
    return runWithDatabaseConnectionOwner(() => verifyStoredContentBlobBytes(
      createBetterSqliteDbPort(openDatabaseConnection().sqlite), row));
  }
  const [stored] = await runWithDatabaseConnectionOwner(() => createBetterSqliteDbPort(
    openDatabaseConnection().sqlite).query<{ data: Uint8Array }>(
    'SELECT data FROM content_blob_data WHERE hash = ?', [row.hash]));
  if (!stored) return false;
  return stored.data.byteLength === row.stored_size_bytes &&
    createHash('sha256').update(stored.data).digest('hex') === row.stored_sha256;
}

/** Check existing blob bytes as well as missing rows, without holding the full library in memory. */
export async function verifyDesktopSyncIdentityBlobBytes(peer: DesktopSyncGroupPeer) {
  let after = '';
  for (;;) {
    const rows = await readBlobPage(after);
    if (rows.length === 0) return;
    for (const row of rows) {
      if (await blobBytesValid(row)) continue;
      const result = await downloadDesktopSyncGroupResources(peer, [], true, [row.hash]);
      if (result.resourceResults.some((item) => item.issues.some((issue) => issue.error === 'disk_full'))) {
        throw new Error('sync_group_resources_disk_full');
      }
      if (result.resourceResults.some((item) => item.unresolved.length > 0) ||
          !await blobBytesValid(row)) throw new Error('sync_group_resources_incomplete');
    }
    after = rows.at(-1)!.hash;
  }
}
