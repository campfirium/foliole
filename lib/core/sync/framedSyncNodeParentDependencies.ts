import type { DbPort, DbRow } from './dbPort.js';
import { latestBranchHeadRecords } from './syncNodeApplyRules.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';
import type { SyncNodeRecordMetadata } from './syncNodeRecordSource.js';
import { isNodeVersionIdentityOnly } from './syncNodeVersionHistory.js';
import { ensureSyncSpecialRootNodes } from './syncSpecialRootNodes.js';

export async function assertFramedSyncNodeParentDependencies(
  db: DbPort,
  nodes: readonly SyncNodeRecordMetadata[],
  rejected?: Map<string, string>
) {
  const currentNodes = latestBranchHeadRecords([...nodes])
    .filter(node => !isNodeVersionIdentityOnly(node) && !node.is_tombstone);
  await ensureSyncSpecialRootNodes(db, currentNodes.flatMap(node => node.snapshot.parent_id
    ? [{ nodeId: node.snapshot.parent_id, referencedAt: node.snapshot.updated_at }] : []));
  const incomingIds = new Set(currentNodes.map(node => node.object_id));
  const prepared = await prepareFramedSyncNodeParents(db, currentNodes);
  const dependencies = new Map<string, Set<string>>();
  for await (const [nodeId, parentId] of prepared.required()) {
    if (rejected && incomingIds.has(parentId)) {
      const parents = dependencies.get(nodeId) ?? new Set<string>();
      parents.add(parentId);
      dependencies.set(nodeId, parents);
    }
    const error = parentId === nodeId ? 'framed_sync_node_parent_cycle'
      : !incomingIds.has(parentId) && !prepared.present.has(parentId) ? `framed_sync_node_parent_missing:${parentId}` : undefined;
    if (!error) continue;
    if (!rejected) throw new Error(error);
    rejected.set(nodeId, error);
  }
  if (rejected) rejectParentCycles(dependencies, rejected);
}

function rejectParentCycles(dependencies: ReadonlyMap<string, ReadonlySet<string>>, rejected: Map<string, string>) {
  const visited = new Set<string>();
  const path = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (path.has(id)) {
      let cycle = false;
      for (const node of path) {
        if (node === id) cycle = true;
        if (cycle) rejected.set(node, 'framed_sync_node_parent_cycle');
      }
      return;
    }
    path.add(id);
    for (const parent of dependencies.get(id) ?? []) visit(parent);
    path.delete(id);
    visited.add(id);
  };
  for (const id of dependencies.keys()) visit(id);
}

/** Read parent requirements separately from creating roots or applying the nodes. */
export async function prepareFramedSyncNodeParents(db: DbPort, currentNodes: readonly SyncNodeRecordMetadata[]) {
  const projections = await loadProjections(db, currentNodes.map(node => node.object_id));
  const present = await loadPresentNodeIds(db, currentNodes.flatMap(node => node.snapshot.parent_id ? [node.snapshot.parent_id] : []));
  return { present, async *required() {
    for (const node of currentNodes) {
      if (await retainsCurrentProjection(db, node, projections.get(node.object_id))) continue;
      if (node.snapshot.parent_id) yield [node.object_id, node.snapshot.parent_id] as const;
    }
  } };
}

type Projection = { current_version_id: string | null; sync_dirty: number };

async function loadProjections(db: DbPort, nodeIds: readonly string[]) {
  const rows = nodeIds.length ? await db.query<Projection & { id: string }>(`SELECT id, current_version_id, sync_dirty
    FROM nodes WHERE id IN (SELECT value FROM json_each(?))`, [JSON.stringify(nodeIds)]) : [];
  return new Map(rows.map(({ id, ...row }) => [id, row]));
}

async function loadPresentNodeIds(db: DbPort, nodeIds: readonly string[]) {
  const rows = nodeIds.length ? await db.query<DbRow & { id: string }>(
    'SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify([...new Set(nodeIds)])]) : [];
  return new Set(rows.map(row => row.id));
}

async function retainsCurrentProjection(db: DbPort, node: SyncNodeRecordMetadata, current: Projection | undefined) {
  if (!current?.current_version_id || !node.version_id) return false;
  if (node.version_id === current.current_version_id) return true;
  return current.sync_dirty === 0 && await isStoredAncestorVersion(db, node.version_id, current.current_version_id);
}
