import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { adoptVerifiedBodyWithDriver } from './bodyContentWriteWithDriver.js';
import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { computeNodeSyncHash } from './nodeSyncHash.js';
import { computeNodeSyncHashWithBody } from './nodeSyncHashWithBody.js';
import { upsertSyncObjectState } from './syncState.js';
import { loadVerifiedBodyRefWithDriver } from './verifiedBodyWithDriver.js';

type BodyStorage = 'continuous' | 'chunked';

interface TombstoneSourceRow extends DatabaseRow {
  body_state?: 'readable' | 'retired' | 'unavailable';
  body_blob_hash?: string | null;
  content_hash: string;
  host_name: string;
  parent_version_id: string | null;
  snapshot_json: string;
  version_id: string;
}

function snapshotHashInput(snapshot: NativeSyncNodeRecord['snapshot']) {
  return {
    anchorLink: snapshot.anchor_link,
    attachments: snapshot.attachments.map((attachment) => ({
      attachmentId: attachment.attachment_id,
      role: attachment.role
    })),
    content: snapshot.content ?? '',
    createdAt: snapshot.created_at,
    deletedAt: snapshot.deleted_at,
    desiredRetention: snapshot.desired_retention,
    enableShortTerm: snapshot.enable_short_term ?? null,
    sequentialReadingEnabled: snapshot.sequential_reading_enabled ?? null,
    shelvedAt: snapshot.shelved_at ?? null,
    manualChildOrder: snapshot.manual_child_order ?? null,
    hideTitleHeading: snapshot.hide_title_heading,
    id: snapshot.id,
    imageRegions: snapshot.image_regions,
    imageSources: snapshot.image_sources ?? null,
    importContentFingerprint: snapshot.import_content_fingerprint ?? null,
    importSourceFingerprint: snapshot.import_source_fingerprint ?? null,
    isTitleManual: snapshot.is_title_manual,
    kind: snapshot.kind,
    openingText: snapshot.opening_text,
    parentId: snapshot.parent_id,
    priority: snapshot.priority,
    reveal: snapshot.reveal,
    title: snapshot.title,
    updatedAt: snapshot.updated_at,
    virtualFilter: snapshot.virtual_filter
  };
}

function forceDeletedSnapshot(snapshotJson: string, deletedAt: string) {
  const snapshot = JSON.parse(snapshotJson) as NativeSyncNodeRecord['snapshot'];
  delete snapshot.position;
  return {
    ...snapshot,
    deleted_at: deletedAt,
    updated_at: deletedAt
  };
}

function prepareTombstoneSource(driver: DatabaseDriver, storage: BodyStorage) {
  return driver.prepare(
    `SELECT
       v.version_id,
       v.parent_version_id,
       v.host_name,
       v.content_hash,
       ${storage === 'chunked' ? `json_set(v.snapshot_json, '$.content', NULL) AS snapshot_json,
         v.body_state, v.body_blob_hash` : 'v.snapshot_json'}
     FROM nodes n
     INNER JOIN node_sync_versions v
       ON v.version_id = n.current_version_id
     WHERE n.id = ?`
  );
}

function prepareTombstoneUpsert(driver: DatabaseDriver, storage: BodyStorage) {
  return driver.prepare(
    `INSERT INTO node_sync_tombstones (
       node_id,
       version_id,
       parent_version_id,
       host_name,
       content_hash,
       snapshot_json,
       deleted_at,
       created_at${storage === 'chunked' ? ', inline_body_hash' : ''}
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?${storage === 'chunked' ? ', ?' : ''})
     ON CONFLICT(node_id) DO UPDATE SET
       version_id = excluded.version_id,
       parent_version_id = excluded.parent_version_id,
       host_name = excluded.host_name,
       content_hash = excluded.content_hash,
       snapshot_json = excluded.snapshot_json,
       deleted_at = excluded.deleted_at,
       created_at = excluded.created_at${storage === 'chunked' ? `,
       inline_body_hash = CASE WHEN excluded.inline_body_hash IS NULL
         AND node_sync_tombstones.version_id = excluded.version_id
         AND node_sync_tombstones.content_hash = excluded.content_hash
         THEN node_sync_tombstones.inline_body_hash ELSE excluded.inline_body_hash END` : ''}`
  );
}

function writeNodeSyncTombstoneRow(
  driver: DatabaseDriver,
  upsert: ReturnType<DatabaseDriver['prepare']>,
  nodeId: string,
  row: TombstoneSourceRow,
  deletedAt: string,
  storage: BodyStorage
) {
  const snapshot = forceDeletedSnapshot(row.snapshot_json, deletedAt);
  const sourceSnapshot = JSON.parse(row.snapshot_json) as NativeSyncNodeRecord['snapshot'];
  const sameDeletion = sourceSnapshot.deleted_at === deletedAt && sourceSnapshot.updated_at === deletedAt;
  const proof = prepareTombstoneBody(driver, row, snapshot, sameDeletion, deletedAt, storage);
  const contentHash = sameDeletion ? row.content_hash : proof.contentHash;
  upsert.run([
    nodeId,
    row.version_id,
    row.parent_version_id,
    row.host_name,
    contentHash,
    JSON.stringify(storage === 'chunked' ? { ...snapshot, content: null } : snapshot),
    deletedAt,
    deletedAt,
    ...(storage === 'chunked' ? [proof.bodyHash] : [])
  ]);
  upsertSyncObjectState(driver, {
    contentHash,
    currentVersionId: row.version_id,
    deletedAt,
    lastModifiedByHostName: row.host_name,
    objectId: nodeId,
    objectType: 'node',
    syncDirty: false,
    updatedAt: deletedAt
  });
}

export function writeNodeSyncTombstonesForPermanentDelete(
  driver: DatabaseDriver,
  nodeIds: string[],
  deletedAt: string | null | undefined,
  storage: BodyStorage = 'continuous'
) {
  if (!deletedAt || nodeIds.length === 0) return;
  const source = prepareTombstoneSource(driver, storage);
  const upsert = prepareTombstoneUpsert(driver, storage);

  for (const nodeId of nodeIds) {
    const row = source.get<TombstoneSourceRow>([nodeId]);
    if (row) {
      writeNodeSyncTombstoneRow(driver, upsert, nodeId, row, deletedAt, storage);
    }
  }
}

function prepareTombstoneBody(driver: DatabaseDriver, row: TombstoneSourceRow,
  snapshot: NativeSyncNodeRecord['snapshot'], sameDeletion: boolean, deletedAt: string, storage: BodyStorage) {
  if (storage === 'continuous') return { bodyHash: null,
    contentHash: sameDeletion ? row.content_hash : computeNodeSyncHash(snapshotHashInput(snapshot)) };
  const ref = row.body_state === 'readable' && row.body_blob_hash
    ? loadVerifiedBodyRefWithDriver(driver, row.body_blob_hash) : null;
  if (!sameDeletion && !ref) throw new Error('body_content_unavailable');
  const contentHash = !sameDeletion && ref
    ? computeNodeSyncHashWithBody(driver, snapshotHashInput(snapshot), ref) : row.content_hash;
  if (ref) adoptVerifiedBodyWithDriver(driver, ref, deletedAt);
  return { bodyHash: ref?.hash ?? null, contentHash };
}
