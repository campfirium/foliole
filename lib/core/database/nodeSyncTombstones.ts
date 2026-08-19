import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { computeNodeSyncHash } from './nodeSyncHash.js';
import { upsertSyncObjectState } from './syncState.js';

interface TombstoneSourceRow extends DatabaseRow {
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
    importContentFingerprint: snapshot.import_content_fingerprint ?? null,
    importSourceFingerprint: snapshot.import_source_fingerprint ?? null,
    isTitleManual: snapshot.is_title_manual,
    kind: snapshot.kind,
    openingText: snapshot.opening_text,
    parentId: snapshot.parent_id,
    position: snapshot.position,
    priority: snapshot.priority,
    reveal: snapshot.reveal,
    title: snapshot.title,
    updatedAt: snapshot.updated_at,
    virtualFilter: snapshot.virtual_filter
  };
}

function forceDeletedSnapshot(snapshotJson: string, deletedAt: string) {
  const snapshot = JSON.parse(snapshotJson) as NativeSyncNodeRecord['snapshot'];
  return {
    ...snapshot,
    deleted_at: deletedAt,
    updated_at: deletedAt
  };
}

function prepareTombstoneSource(driver: DatabaseDriver) {
  return driver.prepare(
    `SELECT
       v.version_id,
       v.parent_version_id,
       v.host_name,
       v.content_hash,
       v.snapshot_json
     FROM nodes n
     INNER JOIN node_sync_versions v
       ON v.version_id = n.current_version_id
     WHERE n.id = ?`
  );
}

function prepareTombstoneUpsert(driver: DatabaseDriver) {
  return driver.prepare(
    `INSERT INTO node_sync_tombstones (
       node_id,
       version_id,
       parent_version_id,
       host_name,
       content_hash,
       snapshot_json,
       deleted_at,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       version_id = excluded.version_id,
       parent_version_id = excluded.parent_version_id,
       host_name = excluded.host_name,
       content_hash = excluded.content_hash,
       snapshot_json = excluded.snapshot_json,
       deleted_at = excluded.deleted_at,
       created_at = excluded.created_at`
  );
}

function writeNodeSyncTombstoneRow(
  driver: DatabaseDriver,
  upsert: ReturnType<DatabaseDriver['prepare']>,
  nodeId: string,
  row: TombstoneSourceRow,
  deletedAt: string
) {
  const snapshot = forceDeletedSnapshot(row.snapshot_json, deletedAt);
  const contentHash = computeNodeSyncHash(snapshotHashInput(snapshot));
  upsert.run([
    nodeId,
    row.version_id,
    row.parent_version_id,
    row.host_name,
    contentHash,
    JSON.stringify(snapshot),
    deletedAt,
    deletedAt
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
  deletedAt: string | null | undefined
) {
  if (!deletedAt || nodeIds.length === 0) return;
  const source = prepareTombstoneSource(driver);
  const upsert = prepareTombstoneUpsert(driver);

  for (const nodeId of nodeIds) {
    const row = source.get([nodeId]) as TombstoneSourceRow | undefined;
    if (row) {
      writeNodeSyncTombstoneRow(driver, upsert, nodeId, row, deletedAt);
    }
  }
}
