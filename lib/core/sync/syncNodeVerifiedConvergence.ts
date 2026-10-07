import type { DbPort } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { applyVerifiedSyncNodesWithDbPort } from './syncNodeVerifiedApplyExecutor.js';
import { loadCurrentVerifiedSyncNode } from './syncNodeVerifiedGraph.js';
import { expireVerifiedTopicText, reviveDeletedFoldersForVerifiedChildren } from './syncNodeVerifiedLifecycle.js';
import { resolveVerifiedSnapshotConflict } from './syncNodeVerifiedSnapshotConflict.js';
import { resolveVerifiedTopicConflict } from './syncNodeVerifiedTopicConflict.js';

/** All selected content remains durably owned until the business transaction commits. */
export async function applyConvergentVerifiedSyncNodesWithDbPort(port: DbPort,
  records: readonly VerifiedFramedSyncNode[]) {
  return port.transaction(async (tx) => {
    const ids = [...new Set(records.map((record) => record.metadata.object_id))];
    const known = new Set<string>();
    for (const id of ids) {
      if ((await tx.query('SELECT 1 AS known FROM sync_object_state WHERE object_type = ? AND object_id = ?',
        ['node', id])).length) known.add(id);
    }
    const result = await applyVerifiedSyncNodesWithDbPort(tx, records);
    const conflicts = groupByObjectId(result.conflictNodes);
    const resolvedIds: string[] = [];
    for (const group of conflicts) resolvedIds.push((await resolveConflict(tx, group)).metadata.object_id);
    if (result.blockedIds.length) throw new Error(`sync_node_apply_blocked:${result.blockedIds.join(',')}`);
    for (const id of ids) await expireVerifiedTopicText(tx, id, new Date().toISOString());
    await reviveDeletedFoldersForVerifiedChildren(tx, records, new Set([...result.appliedIds, ...resolvedIds]));
    const newIds = records.filter((record) => !known.has(record.metadata.object_id)).map((record) => record.metadata.object_id);
    return { appliedNodeCount: new Set([...result.appliedIds, ...resolvedIds, ...newIds]).size,
      handledConflictCount: conflicts.length, newNodeIds: newIds, processedNodeIds: ids };
  });
}

async function resolveConflict(db: DbPort, group: VerifiedFramedSyncNode[]) {
  if (group.every((record) => record.metadata.snapshot.kind === 'folder')) return resolveVerifiedSnapshotConflict(db, group, 'folder');
  if (group.every((record) => record.metadata.snapshot.kind === 'item')) return resolveVerifiedSnapshotConflict(db, group, 'item');
  const id = group[0]!.metadata.object_id;
  if (group.some((record) => record.metadata.snapshot.kind !== 'topic')) throw new Error(`sync_node_conflict_kind_mismatch:${id}`);
  const current = await loadCurrentVerifiedSyncNode(db, id);
  if (!current) throw new Error(`sync_topic_conflict_version_missing:${id}`);
  const resolution = await resolveVerifiedTopicConflict(db, current, group, new Date().toISOString());
  const applied = await applyVerifiedSyncNodesWithDbPort(db, [resolution], {
    includeAlreadyApplied: true, operation: 'local_mutation'
  });
  if (!applied.appliedIds.includes(id)) throw new Error(`sync_topic_resolution_not_applied:${id}`);
  await collectNodeVersionPayloads(db, id, Number.MAX_SAFE_INTEGER, false, 'chunked');
  return resolution;
}

function groupByObjectId(records: readonly VerifiedFramedSyncNode[]) {
  const groups = new Map<string, VerifiedFramedSyncNode[]>();
  for (const record of records) {
    const id = record.metadata.object_id;
    groups.set(id, [...groups.get(id) ?? [], record]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, group]) => group);
}
