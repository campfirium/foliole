import { createHash } from 'node:crypto';

import type {
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord
} from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import {
  decideIncomingNodeApply,
  isConflictCopyNodeId,
  latestBranchHeadRecords,
  orderNodesForApply,
  type LocalSyncNodeState
} from './syncNodeApplyRules.js';
import {
  buildAttachmentExistsQuery,
  buildNodeAttachmentDelete,
  buildNodeAttachmentInsert,
  buildNodeOrderReplace,
  buildRemoteNodeUpsert,
  buildRemoteNodeVersionUpsert
} from './syncNodeApplyStatements.js';

interface LocalSyncNodeStateRow extends DbRow, LocalSyncNodeState {}

export interface ApplySyncNodesWithDbPortResult {
  appliedIds: string[];
  blockedIds: string[];
  conflictRecords: NativeSyncNodeConflictRecord[];
  conflictNodes: NativeSyncNodeRecord[];
  skippedConflictCopyIds: string[];
}

export interface ApplySyncNodesWithDbPortOptions {
  includeAlreadyApplied?: boolean;
}

function hashTextBody(content: string) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function textBodyBlobBytes(content: string) {
  return new TextEncoder().encode(content);
}

async function queryOne<T extends DbRow>(port: DbPort, sql: string, params: readonly (string | number | bigint | Uint8Array | null)[] = []) {
  const rows = await port.query<T>(sql, params);
  return rows[0] ?? null;
}

async function upsertTextBodyBlob(port: DbPort, content: string, now: string) {
  const hash = hashTextBody(content);
  const size = textBodyBlobBytes(content).byteLength;
  await port.run(
    `INSERT INTO content_blobs (
       hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes,
       original_sha256, stored_sha256, availability, created_at, cached_at, last_verified_at
     ) VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'local', ?, ?, ?)
     ON CONFLICT(hash) DO NOTHING`,
    [hash, `text/${hash}`, size, size, hash, hash, now, now, now]
  );
  await port.run(
    `INSERT INTO content_blob_data (hash, data)
     VALUES (?, ?)
     ON CONFLICT(hash) DO NOTHING`,
    [hash, textBodyBlobBytes(content)]
  );
  return hash;
}

async function loadLocalNodeSyncState(port: DbPort, nodeId: string) {
  return queryOne<LocalSyncNodeStateRow>(
    port,
    `SELECT current_version_id, deleted_at, sync_dirty
     FROM nodes
     WHERE id = ?`,
    [nodeId]
  );
}

async function upsertRemoteVersion(port: DbPort, record: NativeSyncNodeRecord) {
  const statement = buildRemoteNodeVersionUpsert(record);
  if (!statement) return;
  await port.run(statement.sql, statement.params);
}

async function upsertRemoteNode(port: DbPort, record: NativeSyncNodeRecord) {
  const content = record.snapshot.content ?? '';
  const bodyBlobHash = record.snapshot.body_blob_hash ?? await upsertTextBodyBlob(port, content, record.snapshot.updated_at);
  const statement = buildRemoteNodeUpsert(record, bodyBlobHash);
  await port.run(statement.sql, statement.params);
}

async function replaceNodeOrder(port: DbPort, record: NativeSyncNodeRecord) {
  const statement = buildNodeOrderReplace(record);
  await port.run(statement.sql, statement.params);
}

async function replaceNodeAttachmentLinks(port: DbPort, record: NativeSyncNodeRecord) {
  const deleteStatement = buildNodeAttachmentDelete(record);
  await port.run(deleteStatement.sql, deleteStatement.params);
  for (const attachment of record.snapshot.attachments) {
    const existsQuery = buildAttachmentExistsQuery(attachment.attachment_id);
    const existing = await queryOne(port, existsQuery.sql, existsQuery.params);
    if (!existing) continue;
    const insertStatement = buildNodeAttachmentInsert(record, attachment);
    await port.run(insertStatement.sql, insertStatement.params);
  }
}

async function applyRemoteNode(port: DbPort, record: NativeSyncNodeRecord) {
  await upsertRemoteNode(port, record);
  await upsertRemoteVersion(port, record);
  await replaceNodeOrder(port, record);
  await replaceNodeAttachmentLinks(port, record);
}

function toConflictRecord(record: NativeSyncNodeRecord): NativeSyncNodeConflictRecord {
  return {
    conflict_version_id: record.version_id,
    content_hash: record.content_hash,
    device_id: record.device_id,
    object_id: record.object_id,
    parent_version_id: record.parent_version_id,
    snapshot: record.snapshot,
    updated_at: record.updated_at
  };
}

export async function applySyncNodesWithDbPort(
  port: DbPort,
  records: NativeSyncNodeRecord[],
  options: ApplySyncNodesWithDbPortOptions = {}
): Promise<ApplySyncNodesWithDbPortResult> {
  const result: ApplySyncNodesWithDbPortResult = {
    appliedIds: [],
    blockedIds: [],
    conflictRecords: [],
    conflictNodes: [],
    skippedConflictCopyIds: []
  };
  const ordered = orderNodesForApply(latestBranchHeadRecords(records));

  await port.transaction(async (tx) => {
    for (const record of ordered) {
      if (isConflictCopyNodeId(record.object_id) || isConflictCopyNodeId(record.snapshot.id)) {
        result.skippedConflictCopyIds.push(record.object_id);
        continue;
      }
      const localNode = await loadLocalNodeSyncState(tx, record.object_id);
      const decision = decideIncomingNodeApply(localNode, record);
      if (decision === 'apply_missing_local' || decision === 'apply_fast_forward') {
        await applyRemoteNode(tx, record);
        result.appliedIds.push(record.object_id);
        continue;
      }
      await upsertRemoteVersion(tx, record);
      if (decision === 'already_applied') {
        if (options.includeAlreadyApplied) {
          result.appliedIds.push(record.object_id);
        }
        continue;
      }
      if (decision === 'block_incoming') {
        result.blockedIds.push(record.object_id);
        continue;
      }
      result.conflictRecords.push(toConflictRecord(record));
      result.conflictNodes.push(record);
    }
  });

  return result;
}
