import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { syncWorkspaceSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { openDatabaseConnection } from './connection.js';

interface ApplySyncNodesOptions {
  includeAlreadyApplied?: boolean;
}

function orderNodesForApply(records: NativeSyncNodeRecord[]) {
  const byId = new Map(records.map((record) => [record.object_id, record]));
  const ordered: NativeSyncNodeRecord[] = [];
  const visited = new Set<string>();

  function visit(record: NativeSyncNodeRecord) {
    if (visited.has(record.object_id)) {
      return;
    }
    const parent = record.snapshot.parent_id ? byId.get(record.snapshot.parent_id) : null;
    if (parent) {
      visit(parent);
    }
    visited.add(record.object_id);
    ordered.push(record);
  }

  for (const record of records) {
    visit(record);
  }
  return ordered;
}

function upsertRemoteVersion(driver: DatabaseDriver, record: NativeSyncNodeRecord) {
  if (!record.version_id || !record.device_id || !record.version_created_at) {
    return;
  }
  driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(version_id) DO UPDATE SET
       object_id = excluded.object_id,
       parent_version_id = excluded.parent_version_id,
       device_id = excluded.device_id,
       created_at = excluded.created_at,
       content_hash = excluded.content_hash,
       snapshot_json = excluded.snapshot_json`,
    [
      record.version_id,
      record.object_id,
      record.parent_version_id,
      record.device_id,
      record.version_created_at,
      record.content_hash ?? '',
      JSON.stringify(record.snapshot)
    ]
  );
}

function loadLocalNodeVersion(driver: DatabaseDriver, nodeId: string) {
  return driver.queryOne<{ current_version_id: string | null }>(
    'SELECT current_version_id FROM nodes WHERE id = ?',
    [nodeId]
  );
}

function isRemoteFastForward(record: NativeSyncNodeRecord, localVersionId: string | null | undefined) {
  if (!localVersionId || record.version_id === localVersionId) {
    return true;
  }
  if (record.parent_version_id === localVersionId) {
    return true;
  }
  return record.ancestor_version_ids.includes(localVersionId);
}

function recordRemoteNodeConflict(driver: DatabaseDriver, record: NativeSyncNodeRecord) {
  if (!record.version_id) {
    return;
  }
  driver.execute(
    `INSERT INTO node_sync_conflicts (
       conflict_version_id,
       object_id,
       parent_version_id,
       device_id,
       content_hash,
       snapshot_json,
       detected_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(conflict_version_id) DO UPDATE SET
       object_id = excluded.object_id,
       parent_version_id = excluded.parent_version_id,
       device_id = excluded.device_id,
       content_hash = excluded.content_hash,
       snapshot_json = excluded.snapshot_json,
       detected_at = excluded.detected_at`,
    [
      record.version_id,
      record.object_id,
      record.parent_version_id,
      record.device_id,
      record.content_hash,
      JSON.stringify(record.snapshot),
      new Date().toISOString()
    ]
  );
}

function upsertRemoteNode(driver: DatabaseDriver, record: NativeSyncNodeRecord) {
  const { snapshot } = record;
  driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, opening_text, virtual_filter, reveal, anchor_link, image_regions, position,
       current_version_id, last_modified_by_device_id, sync_dirty, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       parent_id = excluded.parent_id,
       kind = excluded.kind,
       priority = excluded.priority,
       desired_retention = excluded.desired_retention,
       title = excluded.title,
       is_title_manual = excluded.is_title_manual,
       hide_title_heading = excluded.hide_title_heading,
       content = excluded.content,
       opening_text = excluded.opening_text,
       virtual_filter = excluded.virtual_filter,
       reveal = excluded.reveal,
       anchor_link = excluded.anchor_link,
       image_regions = excluded.image_regions,
       position = excluded.position,
       current_version_id = excluded.current_version_id,
       last_modified_by_device_id = excluded.last_modified_by_device_id,
       sync_dirty = 0,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`,
    [
      snapshot.id,
      snapshot.parent_id,
      snapshot.kind,
      snapshot.priority,
      snapshot.desired_retention,
      snapshot.title,
      snapshot.is_title_manual ? 1 : 0,
      snapshot.hide_title_heading ? 1 : 0,
      snapshot.content,
      snapshot.opening_text,
      snapshot.virtual_filter,
      snapshot.reveal,
      snapshot.anchor_link,
      snapshot.image_regions,
      snapshot.position,
      record.version_id,
      record.device_id,
      snapshot.created_at,
      snapshot.updated_at,
      snapshot.deleted_at
    ]
  );
}

function replaceNodeOrderCompat(driver: DatabaseDriver, record: NativeSyncNodeRecord) {
  if (typeof record.snapshot.position !== 'number') {
    driver.execute('DELETE FROM node_order WHERE node_id = ?', [record.object_id]);
    return;
  }
  driver.execute(
    `INSERT INTO node_order (node_id, position)
     VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET position = excluded.position`,
    [record.object_id, record.snapshot.position]
  );
}

function replaceNodeAttachmentLinks(driver: DatabaseDriver, record: NativeSyncNodeRecord) {
  driver.execute('DELETE FROM node_attachments WHERE node_id = ?', [record.object_id]);
  for (const attachment of record.snapshot.attachments) {
    const existing = driver.queryOne<{ id: string }>('SELECT id FROM attachments WHERE id = ?', [attachment.attachment_id]);
    if (!existing) {
      continue;
    }
    driver.execute(
      `INSERT INTO node_attachments (node_id, attachment_id, role)
       VALUES (?, ?, ?)
       ON CONFLICT(node_id, attachment_id, role) DO NOTHING`,
      [record.object_id, attachment.attachment_id, attachment.role]
    );
  }
}

export function applySyncNodes(records: NativeSyncNodeRecord[], options: ApplySyncNodesOptions = {}) {
  if (records.length === 0) {
    return [];
  }
  const connection = openDatabaseConnection();
  const ordered = orderNodesForApply(records);
  const appliedIds: string[] = [];

  connection.driver.transaction(() => {
    for (const record of ordered) {
      const localNode = loadLocalNodeVersion(connection.driver, record.object_id);
      if (!localNode) {
        upsertRemoteNode(connection.driver, record);
        upsertRemoteVersion(connection.driver, record);
        replaceNodeOrderCompat(connection.driver, record);
        replaceNodeAttachmentLinks(connection.driver, record);
        appliedIds.push(record.object_id);
        continue;
      }
      upsertRemoteVersion(connection.driver, record);
      if (!isRemoteFastForward(record, localNode?.current_version_id)) {
        recordRemoteNodeConflict(connection.driver, record);
        continue;
      }
      if (record.version_id === localNode.current_version_id) {
        if (options.includeAlreadyApplied) {
          appliedIds.push(record.object_id);
        }
        continue;
      }
      upsertRemoteNode(connection.driver, record);
      replaceNodeOrderCompat(connection.driver, record);
      replaceNodeAttachmentLinks(connection.driver, record);
      appliedIds.push(record.object_id);
    }
    syncWorkspaceSearchIndexForNodeIds(connection.driver, appliedIds);
  });

  return appliedIds;
}
