import { computeSyncContentHash } from '../database/syncState.js';

import type { DbPort, DbRow } from './dbPort.js';
import { asObject, integer, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

interface CurrentOwnerRow extends DbRow {
  claim_revision: string | null;
  claim_state: string;
  owner_installation_id: string | null;
}

export async function applyWatchedFolderObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('UPDATE watched_folder_bindings SET deleted_at = ?, enabled = 0 WHERE binding_id = ?', [
      record.deleted_at, record.object_id
    ]);
    return;
  }
  const payload = asObject(record);
  const current = (await port.query<CurrentOwnerRow>(
    'SELECT owner_installation_id, claim_revision, claim_state FROM watched_folder_bindings WHERE binding_id = ?',
    [record.object_id]
  ))[0];
  const incomingOwner = text(payload.owner_installation_id);
  const incomingRevision = text(payload.claim_revision);
  const ownerConflict = Boolean(
    current?.owner_installation_id && incomingOwner &&
    (current.owner_installation_id !== incomingOwner || current.claim_revision !== incomingRevision)
  );
  const preserveClaim = Boolean(current?.owner_installation_id && !incomingOwner);
  const owner = ownerConflict || preserveClaim ? current?.owner_installation_id ?? null : incomingOwner;
  const revision = ownerConflict || preserveClaim ? current?.claim_revision ?? null : incomingRevision;
  const claimState = ownerConflict ? 'conflict' : preserveClaim
    ? current?.claim_state ?? 'claimed'
    : text(payload.claim_state) ?? 'unassigned';
  await port.run(
    `INSERT INTO watched_folder_bindings (
       binding_id, owner_installation_id, owner_device_name, owner_platform, claim_state, claim_revision,
       action_mode, archive_path, highlight_mode, highlight_path, keep_preview_json, primary_path,
       enabled, availability, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(binding_id) DO UPDATE SET
       owner_installation_id = excluded.owner_installation_id,
       owner_device_name = CASE WHEN excluded.claim_state = 'conflict' THEN watched_folder_bindings.owner_device_name ELSE excluded.owner_device_name END,
       owner_platform = CASE WHEN excluded.claim_state = 'conflict' THEN watched_folder_bindings.owner_platform ELSE excluded.owner_platform END,
       claim_state = excluded.claim_state, claim_revision = excluded.claim_revision,
       action_mode = CASE WHEN excluded.claim_state = 'conflict' THEN watched_folder_bindings.action_mode ELSE excluded.action_mode END,
       archive_path = CASE WHEN excluded.claim_state = 'conflict' THEN watched_folder_bindings.archive_path ELSE excluded.archive_path END,
       highlight_mode = CASE WHEN excluded.claim_state = 'conflict' THEN watched_folder_bindings.highlight_mode ELSE excluded.highlight_mode END,
       highlight_path = CASE WHEN excluded.claim_state = 'conflict' THEN watched_folder_bindings.highlight_path ELSE excluded.highlight_path END,
       keep_preview_json = CASE WHEN excluded.claim_state = 'conflict' THEN watched_folder_bindings.keep_preview_json ELSE excluded.keep_preview_json END,
       primary_path = CASE WHEN excluded.claim_state = 'conflict' THEN watched_folder_bindings.primary_path ELSE excluded.primary_path END,
       enabled = CASE WHEN excluded.claim_state = 'claimed' THEN excluded.enabled ELSE 0 END,
       availability = excluded.availability, updated_at = excluded.updated_at, deleted_at = NULL`,
    [record.object_id, owner, text(payload.owner_device_name), text(payload.owner_platform), claimState, revision,
      text(payload.action_mode) ?? 'archive', text(payload.archive_path) ?? '',
      text(payload.highlight_mode) ?? 'off', text(payload.highlight_path) ?? '',
      text(payload.keep_preview_json), text(payload.primary_path) ?? '',
      claimState === 'claimed' && integer(payload.enabled) === 1 ? 1 : 0,
      text(payload.availability) ?? 'unknown', text(payload.created_at) ?? record.updated_at, record.updated_at]
  );
  if (ownerConflict) return applyConflictState(port, record, owner, revision);
}

async function applyConflictState(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  ownerInstallationId: string | null,
  claimRevision: string | null
) {
  const conflictHash = computeSyncContentHash('watched_folder', {
    bindingId: record.object_id, claimRevision, claimState: 'conflict', ownerInstallationId
  });
  await port.run(
    `INSERT INTO sync_object_state (
      object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty, deleted_at
    ) VALUES ('watched_folder', ?, COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1), ?,
      'sync-conflict', ?, 1, NULL)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, last_modified_by_device_id = excluded.last_modified_by_device_id,
      updated_at = excluded.updated_at, sync_dirty = 1, deleted_at = NULL`,
    [record.object_id, conflictHash, record.updated_at]
  );
  return false;
}
