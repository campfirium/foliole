import type { DatabaseRow } from '../../lib/core/database/driver.js';

import { openDatabaseConnection } from './connection.js';

export interface AttachmentRecordInput {
  id: string;
  hash: string;
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
  hash: string;
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
  hash: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

function toAttachmentRecord(row: AttachmentRecordRow): AttachmentRecord {
  return {
    id: row.id,
    hash: row.hash,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at
  };
}

export function createAttachmentRecord(input: AttachmentRecordInput): void {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO attachments (
       id,
       hash,
       original_name,
       mime_type,
       size_bytes,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [input.id, input.hash, input.originalName, input.mimeType, input.sizeBytes, input.createdAt]
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
}

export function findAttachmentRecordByHash(hash: string): AttachmentRecord | null {
  const connection = openDatabaseConnection();
  const row = connection.driver.queryOne<AttachmentRecordRow>(
    `SELECT id, hash, original_name, mime_type, size_bytes, created_at
     FROM attachments
     WHERE hash = ?`,
    [hash]
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
       a.hash,
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
      hash: row.hash,
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
}
