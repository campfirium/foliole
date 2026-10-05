import type { DatabaseDriver } from './driver.js';
import { type SyncObjectStateInput, upsertSyncObjectState } from './syncState.js';

type ExternalResourceStateInput = SyncObjectStateInput & {
  objectType: 'external_document' | 'external_folder';
};

export function upsertExternalResourceSyncState(
  driver: DatabaseDriver,
  input: ExternalResourceStateInput
) {
  const current = driver.queryOne<{ content_hash: string; deleted_at: string | null }>(
    `SELECT content_hash, deleted_at FROM sync_object_state
     WHERE object_type = ? AND object_id = ?`, [input.objectType, input.objectId]
  );
  if (current?.content_hash === input.contentHash
    && Boolean(current.deleted_at) === Boolean(input.deletedAt)) return false;
  upsertSyncObjectState(driver, input);
  return true;
}
