import { createHash, randomUUID } from 'node:crypto';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type { DbRow } from '../../lib/core/sync/dbPort.js';
import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { loadCurrentSyncNodeRecord } from './companionSyncNodeGraph.js';
import { openDatabaseConnection } from './connection.js';

interface AlternativeRow extends DbRow, DatabaseRow {
  alternative_id: string;
  body_text: string;
  created_at: string;
  node_id: string;
  source_host_name: string;
  source_version_id: string;
  status: string;
  updated_at: string;
}

export function loadNodeTextAlternativePreview(nodeId: string) {
  const driver = openDatabaseConnection().driver;
  const row = driver.queryOne<AlternativeRow & NodeBodyRow>(
    `SELECT a.*, n.content, n.body_blob_hash, cbd.data AS body_blob_data FROM node_text_alternatives a
     JOIN nodes n ON n.id = a.node_id
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE a.node_id = ? AND a.status = 'available'
     ORDER BY a.updated_at DESC, a.alternative_id ASC LIMIT 1`,
    [nodeId]
  );
  if (!row) return null;
  const body = resolveNodeBody(row);
  if (body.status === 'unavailable') return null;
  return {
    alternative_id: row.alternative_id,
    checked_at: row.updated_at,
    current_content: body.content,
    current_highlight_count: 0,
    kind: 'sync_alternative',
    source_node_id: row.node_id,
    updated_content: row.body_text,
    updated_highlight_count: 0
  };
}

export async function dismissNodeTextAlternative(alternativeId: string) {
  return updateAlternativeStatus(alternativeId, 'dismissed');
}

export async function promoteNodeTextAlternative(alternativeId: string) {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'promote-node-text-alternative' });
  return port.transaction(async (tx) => {
    const alternative = (await tx.query<AlternativeRow>(
      `SELECT * FROM node_text_alternatives WHERE alternative_id = ? AND status = 'available'`,
      [alternativeId]
    ))[0];
    if (!alternative) return unavailableResult(alternativeId);
    const current = await loadCurrentSyncNodeRecord(tx, alternative.node_id);
    if (!current?.version_id) return unavailableResult(alternativeId);
    const now = new Date().toISOString();
    const record = promotedRecord(current, alternative.body_text, now);
    const applied = await applySyncNodesWithDbPort(tx, [record], { includeAlreadyApplied: true });
    if (!applied.appliedIds.includes(alternative.node_id)) throw new Error('text_alternative_promotion_failed');
    await writeAlternativeStatus(tx, alternative, 'promoted', now);
    return { alternative_id: alternativeId, node_id: alternative.node_id, status: 'promoted' };
  });
}

async function updateAlternativeStatus(alternativeId: string, status: 'dismissed') {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'dismiss-node-text-alternative' });
  return port.transaction(async (tx) => {
    const alternative = (await tx.query<AlternativeRow>(
      `SELECT * FROM node_text_alternatives WHERE alternative_id = ? AND status = 'available'`,
      [alternativeId]
    ))[0];
    if (!alternative) return unavailableResult(alternativeId);
    await writeAlternativeStatus(tx, alternative, status, new Date().toISOString());
    return { alternative_id: alternativeId, node_id: alternative.node_id, status };
  });
}

function promotedRecord(current: NativeSyncNodeRecord, body: string, now: string): NativeSyncNodeRecord {
  const snapshot = { ...current.snapshot, body_blob_hash: null, content: body, updated_at: now };
  return {
    ancestor_version_ids: [current.version_id!, ...current.ancestor_version_ids],
    body_text: body,
    content_hash: hash(JSON.stringify({ body, snapshot })),
    host_name: 'desktop-alternative-promotion',
    object_id: current.object_id,
    object_type: 'node',
    parent_version_id: current.version_id,
    parent_version_ids: [current.version_id!],
    snapshot,
    updated_at: now,
    version_created_at: now,
    version_id: createOpaqueVersionRef(randomUUID())
  };
}

async function writeAlternativeStatus(
  port: ReturnType<typeof createBetterSqliteDbPort>,
  alternative: AlternativeRow,
  status: 'dismissed' | 'promoted',
  now: string
) {
  await port.run(
    `UPDATE node_text_alternatives SET status = ?, updated_at = ? WHERE alternative_id = ?`,
    [status, now, alternative.alternative_id]
  );
  const contentHash = hash(JSON.stringify({ ...alternative, status, updated_at: now }));
  await port.run(
    `UPDATE sync_object_state SET state_seq = (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state),
       content_hash = ?, last_modified_by_host_name = 'desktop-alternative-action', updated_at = ?, sync_dirty = 1
     WHERE object_type = 'node_text_alternative' AND object_id = ?`,
    [contentHash, now, alternative.alternative_id]
  );
}

function unavailableResult(alternativeId: string) {
  return { alternative_id: alternativeId, node_id: null, status: 'unavailable' as const };
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
