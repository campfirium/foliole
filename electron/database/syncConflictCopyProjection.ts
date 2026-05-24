import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { upsertNodeSyncState } from './nodeSyncStateRows.js';
import { conflictCopyTitle, conflictCopyVersionId } from './syncConflictCopyIdentity.js';

const INBOX_NODE_ID = 'special-inbox';

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

function buildSnapshot(args: {
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
    enable_short_term: null,
    sequential_reading_enabled: args.record.snapshot.sequential_reading_enabled ?? null,
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

function computeConflictCopyContentHash(args: {
  content: string;
  copyNodeId: string;
  openingText: string | null;
  snapshot: ReturnType<typeof buildSnapshot>;
  timestamp: string;
  title: string;
}) {
  return computeNodeSyncHash({
    anchorLink: null,
    attachments: [],
    content: args.content,
    createdAt: args.timestamp,
    deletedAt: null,
    desiredRetention: null,
    enableShortTerm: null,
    sequentialReadingEnabled: args.snapshot.sequential_reading_enabled ?? null,
    manualChildOrder: null,
    hideTitleHeading: args.snapshot.hide_title_heading,
    id: args.copyNodeId,
    imageRegions: null,
    isTitleManual: true,
    kind: 'topic',
    openingText: args.openingText,
    parentId: INBOX_NODE_ID,
    position: null,
    priority: null,
    reveal: null,
    title: args.title,
    updatedAt: args.timestamp,
    virtualFilter: null
  });
}

function upsertConflictCopyNode(args: {
  bodyBlobHash: string;
  content: string;
  copyNodeId: string;
  deviceId: string;
  driver: DatabaseDriver;
  openingText: string | null;
  record: NativeSyncNodeRecord;
  timestamp: string;
  title: string;
  versionId: string;
}) {
  args.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, enable_short_term, sequential_reading_enabled, title, is_title_manual, hide_title_heading,
       content, body_blob_hash, opening_text, virtual_filter, reveal, anchor_link, image_regions, position,
       current_version_id, last_modified_by_device_id, sync_dirty, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'topic', NULL, NULL, NULL, ?, ?, 1, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, 0, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       parent_id = excluded.parent_id,
      kind = excluded.kind,
      enable_short_term = excluded.enable_short_term,
      sequential_reading_enabled = excluded.sequential_reading_enabled,
      title = excluded.title,
       is_title_manual = excluded.is_title_manual,
       hide_title_heading = excluded.hide_title_heading,
       content = excluded.content,
       body_blob_hash = excluded.body_blob_hash,
       opening_text = excluded.opening_text,
       current_version_id = excluded.current_version_id,
       last_modified_by_device_id = excluded.last_modified_by_device_id,
       sync_dirty = 0,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`,
    [
      args.copyNodeId,
      INBOX_NODE_ID,
      args.record.snapshot.sequential_reading_enabled == null
        ? null
        : args.record.snapshot.sequential_reading_enabled ? 1 : 0,
      args.title,
      args.record.snapshot.hide_title_heading ? 1 : 0,
      args.content,
      args.bodyBlobHash,
      args.openingText,
      args.versionId,
      args.deviceId,
      args.timestamp,
      args.timestamp
    ]
  );
}

function upsertConflictCopyVersion(args: {
  contentHash: string;
  copyNodeId: string;
  deviceId: string;
  driver: DatabaseDriver;
  snapshot: ReturnType<typeof buildSnapshot>;
  timestamp: string;
  versionId: string;
}) {
  args.driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
     ) VALUES (?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT(version_id) DO UPDATE SET
       content_hash = excluded.content_hash,
       snapshot_json = excluded.snapshot_json`,
    [args.versionId, args.copyNodeId, args.deviceId, args.timestamp, args.contentHash, JSON.stringify(args.snapshot)]
  );
}

export function upsertConflictCopyProjection(args: {
  copyNodeId: string;
  driver: DatabaseDriver;
  placeAtTop: boolean;
  record: NativeSyncNodeRecord;
  sourceVersionId: string;
  timestamp: string;
}) {
  const content = args.record.snapshot.content ?? '';
  const title = conflictCopyTitle(args.record);
  const openingText = resolveNodeOpeningText(content, args.record.snapshot.title ?? '');
  const bodyBlobHash = upsertTextBodyBlob(args.driver, content, args.timestamp);
  const deviceId = loadOrCreateDesktopDeviceId(args.timestamp);
  const versionId = conflictCopyVersionId(deviceId, args.copyNodeId, args.sourceVersionId);
  const snapshot = buildSnapshot({ bodyBlobHash, content, copyNodeId: args.copyNodeId, openingText, record: args.record, timestamp: args.timestamp, title });
  const contentHash = computeConflictCopyContentHash({ content, copyNodeId: args.copyNodeId, openingText, snapshot, timestamp: args.timestamp, title });
  ensureInboxNode(args.driver, args.timestamp);
  upsertConflictCopyNode({ bodyBlobHash, content, copyNodeId: args.copyNodeId, deviceId, driver: args.driver, openingText, record: args.record, timestamp: args.timestamp, title, versionId });
  upsertConflictCopyVersion({ contentHash, copyNodeId: args.copyNodeId, deviceId, driver: args.driver, snapshot, timestamp: args.timestamp, versionId });
  upsertNodeSyncState({ contentHash, currentVersionId: versionId, deletedAt: null, deviceId, nodeId: args.copyNodeId, updatedAt: args.timestamp });
}
