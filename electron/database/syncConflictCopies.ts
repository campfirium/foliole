import { createHash } from 'node:crypto';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { upsertNodeSyncState } from './nodeSyncStateRows.js';
import { loadConflictCopyMapping, saveConflictCopyMapping } from './syncConflictCopyMappings.js';
import { recordRemoteNodeConflict } from './syncNodeConflictRecords.js';

const INBOX_NODE_ID = 'special-inbox';

function hashId(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

export function conflictCopyNodeId(versionId: string) {
  return `conflict-copy-${hashId(versionId)}`;
}

export function recordNodeConflictAndCreateCopy(args: {
  driver: DatabaseDriver;
  record: NativeSyncNodeRecord;
  timestamp: string;
}) {
  if (!args.record.version_id) {
    return null;
  }
  recordRemoteNodeConflict(args.driver, args.record, args.timestamp);
  return createNodeConflictCopy(args);
}

function readInboxTopPosition(driver: DatabaseDriver) {
  const row = driver.queryOne<{ position: number | null }>(
    `SELECT MIN(o.position) AS position
     FROM nodes n
     JOIN node_order o ON o.node_id = n.id
     WHERE n.parent_id = ?`,
    [INBOX_NODE_ID]
  );
  if (typeof row?.position === 'number') {
    return row.position - 1;
  }
  const maxRow = driver.queryOne<{ position: number | null }>('SELECT MAX(position) AS position FROM node_order');
  return typeof maxRow?.position === 'number' ? maxRow.position + 1 : 0;
}

function ensureInboxNode(driver: DatabaseDriver, now: string) {
  if (driver.queryOne('SELECT id FROM nodes WHERE id = ?', [INBOX_NODE_ID])) {
    return;
  }
  driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, is_title_manual, hide_title_heading, content, created_at, updated_at
     ) VALUES (?, NULL, 'folder', 'Inbox', 1, 0, '', ?, ?)`,
    [INBOX_NODE_ID, now, now]
  );
}

function conflictCopyTitle(record: NativeSyncNodeRecord) {
  const title = record.snapshot.title?.trim() || 'Untitled';
  return `${title} (conflict copy - ${conflictCopySourceLabel(record.device_id)})`;
}

function conflictCopySourceLabel(deviceId: string | null | undefined) {
  const source = deviceId?.trim().toLowerCase() ?? '';
  if (source.startsWith('android') || source === 'phone') {
    return 'Android';
  }
  if (source.startsWith('desktop') || source === 'windows') {
    return 'Desktop';
  }
  return 'Remote';
}

function buildConflictCopySnapshot(args: {
  bodyBlobHash: string;
  content: string;
  copyNodeId: string;
  openingText: string | null;
  record: NativeSyncNodeRecord;
  timestamp: string;
  title: string;
}) {
  return {
    anchor_link: null,
    attachments: [],
    body_blob_hash: args.bodyBlobHash,
    content: args.content,
    created_at: args.timestamp,
    deleted_at: null,
    desired_retention: null,
    hide_title_heading: args.record.snapshot.hide_title_heading ?? false,
    id: args.copyNodeId,
    image_regions: null,
    is_title_manual: true,
    kind: 'topic',
    opening_text: args.openingText,
    parent_id: INBOX_NODE_ID,
    position: null,
    priority: null,
    reveal: null,
    title: args.title,
    updated_at: args.timestamp,
    virtual_filter: null
  };
}

export function createNodeConflictCopy(args: {
  driver: DatabaseDriver;
  record: NativeSyncNodeRecord;
  timestamp: string;
}) {
  if (!args.record.version_id) {
    return null;
  }
  const conflictVersionId = args.record.version_id;
  const mappedCopyNodeId = loadConflictCopyMapping(args.driver, conflictVersionId);
  if (mappedCopyNodeId) {
    return args.driver.queryOne('SELECT id FROM nodes WHERE id = ?', [mappedCopyNodeId]) ? mappedCopyNodeId : null;
  }
  const copyNodeId = conflictCopyNodeId(conflictVersionId);
  if (args.driver.queryOne('SELECT id FROM nodes WHERE id = ?', [copyNodeId])) {
    saveConflictCopyMapping(args.driver, conflictVersionId, copyNodeId, args.timestamp);
    return copyNodeId;
  }

  const content = args.record.snapshot.content ?? '';
  const title = conflictCopyTitle(args.record);
  const openingText = resolveNodeOpeningText(content, args.record.snapshot.title ?? '');
  const bodyBlobHash = upsertTextBodyBlob(args.driver, content, args.timestamp);
  const deviceId = loadOrCreateDesktopDeviceId(args.timestamp);
  const versionId = `${deviceId}#${copyNodeId}`;
  const snapshot = buildConflictCopySnapshot({
    bodyBlobHash,
    content,
    copyNodeId,
    openingText,
    record: args.record,
    timestamp: args.timestamp,
    title
  });
  const contentHash = computeNodeSyncHash({
    anchorLink: null,
    attachments: [],
    content,
    createdAt: args.timestamp,
    deletedAt: null,
    desiredRetention: null,
    hideTitleHeading: snapshot.hide_title_heading,
    id: copyNodeId,
    imageRegions: null,
    isTitleManual: true,
    kind: 'topic',
    openingText,
    parentId: INBOX_NODE_ID,
    position: null,
    priority: null,
    reveal: null,
    title,
    updatedAt: args.timestamp,
    virtualFilter: null
  });
  ensureInboxNode(args.driver, args.timestamp);
  args.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, body_blob_hash, opening_text, virtual_filter, reveal, anchor_link, image_regions, position,
       current_version_id, last_modified_by_device_id, sync_dirty, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'topic', NULL, NULL, ?, 1, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, 1, ?, ?, NULL)`,
    [
      copyNodeId,
      INBOX_NODE_ID,
      title,
      args.record.snapshot.hide_title_heading ? 1 : 0,
      content,
      bodyBlobHash,
      openingText,
      deviceId,
      args.timestamp,
      args.timestamp
    ]
  );
  args.driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
     ) VALUES (?, ?, NULL, ?, ?, ?, ?)`,
    [versionId, copyNodeId, deviceId, args.timestamp, contentHash, JSON.stringify(snapshot)]
  );
  args.driver.execute(
    `UPDATE nodes
     SET current_version_id = ?, sync_dirty = 0
     WHERE id = ?`,
    [versionId, copyNodeId]
  );
  args.driver.execute(
    `INSERT INTO node_order (node_id, position)
     VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET position = excluded.position`,
    [copyNodeId, readInboxTopPosition(args.driver)]
  );
  upsertNodeSyncState({
    contentHash,
    currentVersionId: versionId,
    deletedAt: null,
    deviceId,
    nodeId: copyNodeId,
    updatedAt: args.timestamp
  });
  saveConflictCopyMapping(args.driver, conflictVersionId, copyNodeId, args.timestamp);
  return copyNodeId;
}
