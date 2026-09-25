import type { DbPort, DbRow } from './dbPort.js';
import {
  buildSyncPackApplyableRowsSql,
  buildSyncPackNodeUpsertSql,
  type SyncPackNodeApplyOptions
} from './syncPackApplyStatements.js';
import { assertValidSyncPackParentChanges } from './syncPackNodeParentValidation.js';
import { ensureSyncPackSpecialRootParents } from './syncPackSpecialRootApply.js';

interface CandidateNode extends DbRow {
  id: string;
  parent_id: string | null;
  exists_locally: number;
  parent_exists: number;
  local_parent_id: string | null;
}

export async function applySyncPackNodeRowsWithDbPort(
  port: DbPort,
  options: SyncPackNodeApplyOptions = {}
) {
  await ensureSyncPackSpecialRootParents(port, options.incomingAlias);
  const candidates = await loadCandidateNodes(port, options);
  await assertValidSyncPackParentChanges(port, candidates);
  const orderedIds = orderNodeInserts(candidates);
  if (orderedIds.length === 0) return;
  const resolvedOptions = await resolveNodeColumns(port, options);
  await port.run(buildSyncPackNodeUpsertSql(resolvedOptions), [JSON.stringify(orderedIds)]);
}

function loadCandidateNodes(port: DbPort, options: SyncPackNodeApplyOptions) {
  const alias = options.incomingAlias ?? 'inc';
  const applyable = buildSyncPackApplyableRowsSql({ ...options, objectType: 'node' });
  return port.query<CandidateNode>(
    `SELECT incoming.id, incoming.parent_id,
       current.id IS NOT NULL AS exists_locally, parent.id IS NOT NULL AS parent_exists,
       current.parent_id AS local_parent_id
     FROM ${alias}.nodes incoming
     LEFT JOIN main.nodes current ON current.id = incoming.id
     LEFT JOIN main.nodes parent ON parent.id = incoming.parent_id
     WHERE incoming.id IN (SELECT object_id FROM ${applyable})
       AND NOT EXISTS (SELECT 1 FROM main.node_sync_tombstones tomb WHERE tomb.node_id = incoming.id)
       ${options.preserveExistingNodes ? 'AND current.id IS NULL' : ''}
     ORDER BY incoming.updated_at, incoming.id`
  );
}

// Only new rows have an insertion dependency. Existing rows are updated after
// their new parents exist, without traversing the existing workspace tree.
function orderNodeInserts(candidates: CandidateNode[]) {
  const missing = new Map(candidates.filter((node) => !node.exists_locally).map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  const ordered: string[] = [];
  for (const node of missing.values()) {
    if (node.parent_id === null || node.parent_exists) {
      ordered.push(node.id);
    } else {
      if (!missing.has(node.parent_id)) throw new Error(`sync_pack_node_parent_missing:${node.id}`);
      const siblings = children.get(node.parent_id) ?? [];
      siblings.push(node.id);
      children.set(node.parent_id, siblings);
    }
  }
  for (let index = 0; index < ordered.length; index++) {
    for (const child of children.get(ordered[index]!) ?? []) ordered.push(child);
  }
  if (ordered.length !== missing.size) throw new Error('sync_pack_node_parent_cycle');
  return [...ordered, ...candidates.filter((node) => node.exists_locally).map((node) => node.id)];
}

async function resolveNodeColumns(port: DbPort, options: SyncPackNodeApplyOptions) {
  if (options.incomingNodeColumns !== undefined) return options;
  const alias = (options.incomingAlias ?? 'inc').replaceAll('"', '""');
  const rows = await port.query<{ name: unknown }>(`PRAGMA "${alias}".table_info(nodes)`);
  return {
    ...options,
    incomingNodeColumns: rows.map((row) => row.name).filter((name): name is string => typeof name === 'string')
  };
}
