import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';

interface NodeSyncVersionSourceRow extends DatabaseRow {
  anchor_link: string | null;
  content: string;
  created_at: string;
  current_version_id: string | null;
  deleted_at: string | null;
  desired_retention: number | null;
  hide_title_heading: number;
  id: string;
  image_regions: string | null;
  is_title_manual: number;
  kind: string;
  opening_text: string | null;
  parent_id: string | null;
  position: number | null;
  priority: number | null;
  reveal: string | null;
  sync_dirty: number;
  title: string;
  updated_at: string;
  virtual_filter: string | null;
}

interface NodeAttachmentRefRow extends DatabaseRow {
  attachment_id: string;
  role: string;
}

interface SettingsRow extends DatabaseRow {
  value: string;
}

const NODE_SYNC_VERSION_COUNTER_KEY = 'desktop_node_sync_version_counter';

function nextNodeSyncVersionId(deviceId: string, now: string) {
  const connection = openDatabaseConnection();
  const currentRow = connection.driver.queryOne<SettingsRow>('SELECT value FROM settings WHERE key = ?', [
    NODE_SYNC_VERSION_COUNTER_KEY
  ]);
  const nextCounter = Number.parseInt(currentRow?.value ?? '0', 10);
  connection.driver.execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    [NODE_SYNC_VERSION_COUNTER_KEY, String(nextCounter + 1), now]
  );
  return `${deviceId}#${nextCounter}`;
}

function loadNodeSyncVersionSource(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<NodeSyncVersionSourceRow>(
    `SELECT
       id,
       parent_id,
       kind,
       priority,
       desired_retention,
       title,
       is_title_manual,
       hide_title_heading,
       content,
       opening_text,
       virtual_filter,
       reveal,
       anchor_link,
       image_regions,
       position,
       current_version_id,
       sync_dirty,
       created_at,
       updated_at,
       deleted_at
     FROM nodes
     WHERE id = ?`,
    [nodeId]
  );
}

function listNodeAttachmentRefs(nodeId: string) {
  return openDatabaseConnection().driver.queryAll<NodeAttachmentRefRow>(
    `SELECT attachment_id, role
     FROM node_attachments
     WHERE node_id = ?
     ORDER BY attachment_id ASC, role ASC`,
    [nodeId]
  );
}

function buildNodeSyncSnapshot(row: NodeSyncVersionSourceRow, nodeId: string) {
  return {
    anchor_link: row.anchor_link,
    attachments: listNodeAttachmentRefs(nodeId),
    content: row.content,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
    desired_retention: row.desired_retention,
    hide_title_heading: row.hide_title_heading === 1,
    id: row.id,
    image_regions: row.image_regions,
    is_title_manual: row.is_title_manual === 1,
    kind: row.kind,
    opening_text: row.opening_text,
    parent_id: row.parent_id,
    position: row.position,
    priority: row.priority,
    reveal: row.reveal,
    title: row.title,
    updated_at: row.updated_at,
    virtual_filter: row.virtual_filter
  };
}

export function flushNodeSyncVersion(nodeId: string, now = new Date().toISOString()): string | null {
  const connection = openDatabaseConnection();
  const deviceId = loadOrCreateDesktopDeviceId(now);
  let createdVersionId: string | null = null;

  connection.driver.transaction(() => {
    const row = loadNodeSyncVersionSource(nodeId);
    if (!row || (row.sync_dirty !== 1 && row.current_version_id)) {
      return;
    }
    const versionId = nextNodeSyncVersionId(deviceId, now);
    const contentHash = computeNodeSyncHash({
      anchorLink: row.anchor_link,
      attachments: listNodeAttachmentRefs(nodeId).map((attachment) => ({
        attachmentId: attachment.attachment_id,
        role: attachment.role
      })),
      content: row.content,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      desiredRetention: row.desired_retention,
      hideTitleHeading: row.hide_title_heading === 1,
      id: row.id,
      imageRegions: row.image_regions,
      isTitleManual: row.is_title_manual === 1,
      kind: row.kind,
      openingText: row.opening_text,
      parentId: row.parent_id,
      position: row.position,
      priority: row.priority,
      reveal: row.reveal,
      title: row.title,
      updatedAt: row.updated_at,
      virtualFilter: row.virtual_filter
    });

    connection.driver.execute(
      `INSERT INTO node_sync_versions (
         version_id,
         object_id,
         parent_version_id,
         device_id,
         created_at,
         content_hash,
         snapshot_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [versionId, row.id, row.current_version_id, deviceId, now, contentHash, JSON.stringify(buildNodeSyncSnapshot(row, nodeId))]
    );
    connection.driver.execute(
      `UPDATE nodes
       SET current_version_id = ?, last_modified_by_device_id = ?, sync_dirty = 0
       WHERE id = ?`,
      [versionId, deviceId, row.id]
    );
    createdVersionId = versionId;
  });

  return createdVersionId;
}

export function flushDirtyNodeSyncVersions(now = new Date().toISOString()) {
  const nodeIds = openDatabaseConnection().driver
    .queryAll<{ id: string }>(
      'SELECT id FROM nodes WHERE sync_dirty = 1 OR current_version_id IS NULL ORDER BY updated_at ASC'
    )
    .map((row) => row.id);

  for (const nodeId of nodeIds) {
    flushNodeSyncVersion(nodeId, now);
  }
  return nodeIds;
}
