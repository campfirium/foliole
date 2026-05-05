import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { syncPdfSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';

export interface AttachmentRecordInput {
  id: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface NodeAttachmentLinkInput {
  nodeId: string;
  attachmentId: string;
  role: string;
}

export type AttachmentRecord = AttachmentRecordInput;

export interface NodeAttachmentRecord extends NodeAttachmentLinkInput {
  attachment: AttachmentRecord;
}

interface NodeAttachmentRow extends DatabaseRow {
  node_id: string;
  attachment_id: string;
  role: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

interface AttachmentNodeLinkRow extends DatabaseRow {
  node_id: string;
  attachment_id: string;
  role: string;
}

interface AttachmentRecordRow extends DatabaseRow {
  id: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

function toAttachmentRecord(row: AttachmentRecordRow): AttachmentRecord {
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at
  };
}

function markNodeAttachmentLinksDirty(nodeId: string, now = new Date().toISOString()) {
  const deviceId = loadOrCreateDesktopDeviceId(now);
  openDatabaseConnection().driver.execute(
    `UPDATE nodes
     SET updated_at = ?, last_modified_by_device_id = ?, sync_dirty = 1
     WHERE id = ?`,
    [now, deviceId, nodeId]
  );
  flushNodeSyncVersion(nodeId, now);
}

function changedRows() {
  return openDatabaseConnection().driver.queryOne<{ count: number }>('SELECT changes() AS count')?.count ?? 0;
}

export function createAttachmentRecord(input: AttachmentRecordInput): void {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO attachments (
       id,
       original_name,
       mime_type,
       size_bytes,
       created_at
     ) VALUES (?, ?, ?, ?, ?)`,
    [input.id, input.originalName, input.mimeType, input.sizeBytes, input.createdAt]
  );
}

export function createNodeAttachmentLink(input: NodeAttachmentLinkInput): void {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO node_attachments (node_id, attachment_id, role)
     VALUES (?, ?, ?)
     ON CONFLICT(node_id, attachment_id, role) DO NOTHING`,
    [input.nodeId, input.attachmentId, input.role]
  );
  if (changedRows() > 0) {
    markNodeAttachmentLinksDirty(input.nodeId);
  }
  syncPdfSearchIndexForNodeIds(connection.driver, [input.nodeId]);
}

export function findAttachmentRecordById(id: string): AttachmentRecord | null {
  const connection = openDatabaseConnection();
  const row = connection.driver.queryOne<AttachmentRecordRow>(
    `SELECT id, original_name, mime_type, size_bytes, created_at
     FROM attachments
     WHERE id = ?`,
    [id]
  );

  return row ? toAttachmentRecord(row) : null;
}

export function listNodeAttachments(nodeId: string): NodeAttachmentRecord[] {
  const connection = openDatabaseConnection();
  const rows = connection.driver.queryAll<NodeAttachmentRow>(
    `SELECT
       na.node_id,
       na.attachment_id,
       na.role,
       a.original_name,
       a.mime_type,
       a.size_bytes,
       a.created_at
     FROM node_attachments na
     INNER JOIN attachments a ON a.id = na.attachment_id
     WHERE na.node_id = ?
     ORDER BY na.role ASC, na.attachment_id ASC`,
    [nodeId]
  );

  return rows.map((row) => ({
    nodeId: row.node_id,
    attachmentId: row.attachment_id,
    role: row.role,
    attachment: {
      id: row.attachment_id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at
    }
  }));
}

export function listAttachmentNodeLinks(attachmentId: string): NodeAttachmentLinkInput[] {
  const connection = openDatabaseConnection();
  const rows = connection.driver.queryAll<AttachmentNodeLinkRow>(
    `SELECT node_id, attachment_id, role
     FROM node_attachments
     WHERE attachment_id = ?
     ORDER BY node_id ASC, role ASC`,
    [attachmentId]
  );

  return rows.map((row) => ({
    nodeId: row.node_id,
    attachmentId: row.attachment_id,
    role: row.role
  }));
}

export function deleteNodeAttachmentLink(input: NodeAttachmentLinkInput): void {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `DELETE FROM node_attachments
     WHERE node_id = ? AND attachment_id = ? AND role = ?`,
    [input.nodeId, input.attachmentId, input.role]
  );
  if (changedRows() > 0) {
    markNodeAttachmentLinksDirty(input.nodeId);
  }
  syncPdfSearchIndexForNodeIds(connection.driver, [input.nodeId]);
}
