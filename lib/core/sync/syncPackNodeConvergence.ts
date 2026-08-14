import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { applyConvergentSyncNodesWithDbPort } from './syncNodeConvergence.js';
import { loadStoredSyncNodeVersionRecord } from './syncNodeGraph.js';
import type { SyncPackNodeRow } from './syncPackNodeFields.js';

export async function applySyncPackVersionedNodesWithDbPort(
  port: DbPort,
  deviceId: string,
  incomingAlias = 'inc'
) {
  const alias = quoteIdentifier(incomingAlias);
  const rows = await port.query<SyncPackNodeRow & { position: number | null }>(
    `SELECT node.*, node_order.position
     FROM ${alias}.nodes node
     LEFT JOIN ${alias}.node_order node_order ON node_order.node_id = node.id
     INNER JOIN ${alias}.sync_object_state state
       ON state.object_type = 'node' AND state.object_id = node.id
     WHERE node.current_version_id IS NOT NULL
     ORDER BY state.state_seq ASC, node.id ASC`
  );
  const records: NativeSyncNodeRecord[] = [];
  for (const row of rows) {
    const versionId = row.current_version_id;
    if (!versionId) throw new Error(`sync_pack_node_current_record_invalid:${row.id}`);
    const record = await loadStoredSyncNodeVersionRecord(port, versionId);
    if (!record || record.object_id !== row.id) {
      throw new Error(`sync_pack_node_current_record_invalid:${row.id}`);
    }
    records.push({
      ...record,
      body_text: record.body_text ?? row.content,
      snapshot: await buildCurrentSnapshot(port, alias, row),
      updated_at: row.updated_at
    });
  }
  if (records.length === 0) {
    return { appliedNodeCount: 0, handledConflictCount: 0, processedNodeIds: [] as string[] };
  }
  const result = await applyConvergentSyncNodesWithDbPort(port, records);
  for (const record of records) {
    await port.run(
      `UPDATE sync_object_state SET last_modified_by_device_id = ?
       WHERE object_type = 'node' AND object_id = ? AND current_version_id = ?`,
      [deviceId, record.object_id, record.version_id]
    );
  }
  return result;
}

async function buildCurrentSnapshot(
  port: DbPort,
  alias: string,
  row: SyncPackNodeRow & { position: number | null }
): Promise<NativeSyncNodeRecord['snapshot']> {
  const attachments = await port.query<{ attachment_id: string; role: string }>(
    `SELECT attachment_id, role FROM ${alias}.node_attachments
     WHERE node_id = ? ORDER BY attachment_id, role`,
    [row.id]
  );
  return {
    anchor_link: row.anchor_link,
    anchor_resolution_status: normalizeAnchorStatus(row.anchor_resolution_status),
    anchor_source_version_id: row.anchor_source_version_id,
    attachments,
    body_blob_hash: row.body_blob_hash,
    content: row.content,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
    desired_retention: row.desired_retention,
    enable_short_term: row.enable_short_term === null ? null : row.enable_short_term === 1,
    hide_title_heading: row.hide_title_heading === 1,
    id: row.id,
    image_regions: row.image_regions,
    import_content_fingerprint: row.import_content_fingerprint,
    import_source_fingerprint: row.import_source_fingerprint,
    is_title_manual: row.is_title_manual === 1,
    kind: row.kind,
    manual_child_order: row.manual_child_order,
    opening_text: row.opening_text,
    parent_id: row.parent_id,
    position: row.position,
    priority: row.priority,
    reveal: row.reveal,
    sequential_reading_enabled: row.sequential_reading_enabled === null
      ? null
      : row.sequential_reading_enabled === 1,
    shelved_at: row.shelved_at,
    title: row.title,
    updated_at: row.updated_at,
    virtual_filter: row.virtual_filter
  };
}

function normalizeAnchorStatus(value: string | null) {
  if (value === 'resolved' || value === 'unmapped_ambiguous' || value === 'unmapped_missing') return value;
  return null;
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
