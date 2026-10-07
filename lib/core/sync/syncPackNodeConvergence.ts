import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { SPECIAL_ROOT_NODE_IDS } from '../database/nodeMutationSpecialRoots.js';
import { projectNodeResourceLinks } from '../database/nodeResourceReferences.js';

import type { DbPort } from './dbPort.js';
import { applyConvergentSyncNodesWithDbPort } from './syncNodeConvergence.js';
import { loadStoredSyncNodeVersionRecords } from './syncNodeGraph.js';
import type { SyncPackNodeRow } from './syncPackNodeFields.js';
import { loadSyncPackVersionAncestry } from './syncPackVersionAncestry.js';

export async function applySyncPackVersionedNodesWithDbPort(
  port: DbPort,
  hostName: string,
  incomingAlias = 'inc'
) {
  const alias = quoteIdentifier(incomingAlias);
  const skipped = await port.query<{ id: string }>(
    `SELECT node.id FROM ${alias}.nodes node
     JOIN main.node_sync_tombstones tomb ON tomb.node_id = node.id`
  );
  const skippedNodeIds = skipped.map((row) => row.id);
  const rows = await port.query<SyncPackNodeRow>(
    `SELECT node.*
     FROM ${alias}.nodes node
     INNER JOIN ${alias}.sync_object_state state
       ON state.object_type = 'node' AND state.object_id = node.id
     WHERE node.current_version_id IS NOT NULL
       AND node.id NOT IN ('special-inbox', 'special-virtual-root')
       AND NOT EXISTS (SELECT 1 FROM main.node_sync_tombstones tomb WHERE tomb.node_id = node.id)
     ORDER BY state.state_seq ASC, node.id ASC`
  );
  const ancestry = await loadSyncPackVersionAncestry(port,
    rows.flatMap((row) => row.current_version_id ? [row.current_version_id] : []));
  const versions = await loadStoredSyncNodeVersionRecords(port,
    rows.flatMap((row) => row.current_version_id ? [row.current_version_id] : []));
  const records: NativeSyncNodeRecord[] = [];
  for (const row of rows) {
    const versionId = row.current_version_id;
    if (!versionId) throw new Error(`sync_pack_node_current_record_invalid:${row.id}`);
    const record = versions.get(versionId);
    if (!record || record.object_id !== row.id) {
      throw new Error(`sync_pack_node_current_record_invalid:${row.id}`);
    }
    const bodyText = record.body_text ?? row.content;
    records.push({
      ...record,
      ancestor_version_ids: ancestry.ancestorIds(versionId),
      body_text: bodyText,
      snapshot: { ...buildCurrentSnapshot(row, bodyText),
        ...(record.snapshot.text_alternatives ? { text_alternatives: record.snapshot.text_alternatives } : {}),
        ...(record.snapshot.text_selection ? { text_selection: record.snapshot.text_selection } : {})
      },
      updated_at: row.updated_at
    });
  }
  if (records.length === 0) {
    return { appliedNodeCount: 0, handledConflictCount: 0, newNodeIds: [],
      processedNodeIds: [...SPECIAL_ROOT_NODE_IDS, ...skippedNodeIds] };
  }
  const result = await applyConvergentSyncNodesWithDbPort(port, records);
  const pairs = records.map((record) => [record.object_id, record.version_id]);
  await port.run(`UPDATE sync_object_state SET last_modified_by_host_name = ?
    WHERE object_type = 'node' AND (object_id, current_version_id) IN
      (VALUES ${pairs.map(() => '(?, ?)').join(', ')})`,
  [hostName, ...pairs.flat()]);
  return { ...result, processedNodeIds: [...new Set([
    ...result.processedNodeIds, ...SPECIAL_ROOT_NODE_IDS, ...skippedNodeIds
  ])] };
}

function buildCurrentSnapshot(
  row: SyncPackNodeRow,
  bodyText: string
): NativeSyncNodeRecord['snapshot'] {
  return {
    anchor_link: row.anchor_link,
    anchor_resolution_status: normalizeAnchorStatus(row.anchor_resolution_status),
    anchor_source_version_id: row.anchor_source_version_id,
    attachments: projectNodeResourceLinks(row.resource_references),
    body_blob_hash: row.body_blob_hash,
    content: bodyText,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
    desired_retention: row.desired_retention,
    enable_short_term: row.enable_short_term === null ? null : row.enable_short_term === 1,
    hide_title_heading: row.hide_title_heading === 1,
    id: row.id,
    image_regions: row.image_regions,
    image_sources: row.image_sources,
    resource_references: row.resource_references,
    import_content_fingerprint: row.import_content_fingerprint,
    import_source_fingerprint: row.import_source_fingerprint,
    is_title_manual: row.is_title_manual === 1,
    kind: row.kind,
    manual_child_order: row.manual_child_order,
    opening_text: row.opening_text,
    parent_id: row.parent_id,
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
