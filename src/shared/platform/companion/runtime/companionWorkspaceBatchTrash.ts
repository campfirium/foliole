import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { prepareWorkspaceNodeChildrenIndex } from '../../../../features/nodes/model/workspaceNodeChildrenIndex';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from './companionNodeHistory';
import { iosCompanionHostName } from './iosCompanionMutationState';

export type CompanionBatchTarget = { id: string; version: string };

export function collectCompanionBatchSubtree(
  nodes: Record<string, WorkspaceNodeSnapshot>,
  rootIds: readonly string[]
) {
  const { children } = prepareWorkspaceNodeChildrenIndex(nodes);
  const visited = new Set<string>();
  const selected = new Set(rootIds);
  const roots = rootIds.filter(id => {
    const ancestors = new Set([id]);
    let parent = nodes[id]?.parentNodeId;
    while (parent && !ancestors.has(parent)) {
      if (selected.has(parent)) return false;
      ancestors.add(parent);
      parent = nodes[parent]?.parentNodeId;
    }
    return true;
  });
  const pending = [...roots].reverse();
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const direct = children.get(id) ?? [];
    for (const child of [...direct].reverse()) pending.push(child.id);
  }
  return [...visited].map(id => nodes[id]!);
}

export function canMoveCompanionBatchNodeToTrash(node: WorkspaceNodeSnapshot | undefined) {
  return Boolean(node?.currentVersionId && !node.deletedAt && !node.webPublishedAt && !node.id.startsWith('special-') && !node.virtualFilter);
}

export function moveCompanionBatchToTrash(targets: readonly CompanionBatchTarget[]) {
  return runCompanionHistoryMutation(async db => {
    const snapshot = await loadIosCompanionWorkspaceSnapshot(db);
    const nodes = snapshot?.nodesById ?? {};
    if (targets.some(({ id, version }) => !canMoveCompanionBatchNodeToTrash(nodes[id]) ||
      nodes[id]?.currentVersionId !== version)) throw new Error('workspace_batch_selection_changed');
    const now = new Date().toISOString();
    const host = await iosCompanionHostName(db);
    const changes = collectCompanionBatchSubtree(nodes, targets.map(target => target.id)).filter(node => !node.deletedAt);
    if (changes.some(node => node.webPublishedAt)) throw new Error('workspace_batch_published_topic');
    const records = await Promise.all(changes.map(node => createCompanionMetadataVersion(db, {
      ...node, deletedAt: now, updatedAt: now
    }, host)));
    await commitCompanionNodeHistoryWithDb(db, records, 'Move to Trash');
    return changes.map(node => node.id);
  }, nodeIds => ({ kind: 'nodes', nodeIds, structure: true }));
}
