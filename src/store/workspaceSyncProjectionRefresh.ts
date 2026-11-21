import type { WorkspaceRefreshScope } from '../../lib/core/database/workspaceSnapshotRefresh';
import { loadWorkspaceListProjectionFromRuntime } from '../shared/platform/desktop/workspaceListProjectionRuntimeRepository';
import { loadWorkspaceNodeDocumentFromRuntime } from '../shared/platform/workspaceRuntimeRepository';

import { deferNodeContentRefreshUntilPersisted, hasUnconfirmedNodeContent } from './workspaceNodeContentVersionGuard';
import { requestWorkspaceSyncRefresh } from './workspaceRefreshScheduler';
import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';
import { useWorkspaceStore } from './workspaceStore';
import type { WorkspaceState } from './workspaceStoreTypes';
import { mergeWorkspaceSyncProjection, projectionChangesStructure } from './workspaceSyncProjectionMerge';

type NodeScope = Extract<WorkspaceRefreshScope, { kind: 'nodes' }>;

/**
 * What the renderer still lists around a structural change: the nodes' current parents and their listed
 * descendants. The projection rereads their child sequences and confirms which of them still exist, so the
 * list order and membership are rebuilt without reading the whole library.
 */
export function listKnownStructureNodeIds(baseline: Pick<WorkspaceState, 'nodesById'>, roots: Iterable<string>) {
  const children = new Map<string, string[]>();
  for (const [id, node] of Object.entries(baseline.nodesById)) {
    if (!node.parentNodeId) continue;
    const siblings = children.get(node.parentNodeId);
    if (siblings) siblings.push(id);
    else children.set(node.parentNodeId, [id]);
  }
  const ids = new Set<string>();
  const visit = (id: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    children.get(id)?.forEach(visit);
  };
  for (const root of roots) {
    const parent = baseline.nodesById[root]?.parentNodeId;
    if (parent) ids.add(parent);
    visit(root);
  }
  return [...ids];
}

export async function refreshWorkspaceSyncProjection(scope: NodeScope, libraryScope: string) {
  const baseline = useWorkspaceStore.getState();
  if (!baseline.libraryScope) throw new Error('workspace_projection_baseline_missing');
  if (baseline.libraryScope !== libraryScope) return;
  const roots = new Set([...scope.nodeIds, ...scope.reviewNodeIds ?? [], ...scope.readingNodeIds ?? [],
    ...scope.openStateNodeIds ?? []]);
  const ancestors = new Set<string>();
  for (const id of roots) {
    let parent = baseline.nodesById[id]?.parentNodeId;
    while (parent && !ancestors.has(parent)) {
      ancestors.add(parent);
      parent = baseline.nodesById[parent]?.parentNodeId;
    }
  }
  const ancestorNodeIds = [...ancestors];
  const structureNodeIds = (ids: Iterable<string>) => listKnownStructureNodeIds(baseline, ids);
  let projection = await loadWorkspaceListProjectionFromRuntime({ nodeIds: [...roots], structure: scope.structure === true,
    libraryScope, ancestorNodeIds, ...(scope.structure ? { structureNodeIds: structureNodeIds(roots) } : {}) });
  if (!projection.structure && projectionChangesStructure(baseline, projection)) {
    projection = await loadWorkspaceListProjectionFromRuntime(
      { nodeIds: [...roots], structure: true, libraryScope, ancestorNodeIds, structureNodeIds: structureNodeIds(roots) });
  }
  const missing = projection.structure?.memberIds.filter(id => !baseline.nodesById[id] && !projection.nodesById[id]) ?? [];
  if (missing.length) {
    const nodeIds = [...roots, ...missing];
    projection = await loadWorkspaceListProjectionFromRuntime(
      { nodeIds, structure: true, libraryScope, ancestorNodeIds, structureNodeIds: structureNodeIds(nodeIds) });
  }
  const activeId = useWorkspaceStore.getState().activeNodeId;
  const activeNode = activeId ? baseline.nodesById[activeId] : null;
  const dependencies = new Set<string>();
  let dependency = activeId;
  while (dependency && !dependencies.has(dependency)) {
    dependencies.add(dependency);
    dependency = projection.nodesById[dependency]?.parentNodeId ?? baseline.nodesById[dependency]?.parentNodeId ?? null;
  }
  const contentChanged = Object.entries(projection.nodesById).filter(([id]) => dependencies.has(id)).some(([id, node]) => {
    const previous = baseline.nodesById[id];
    return !previous || previous.currentVersionId !== node.currentVersionId
      || previous.updatedAt !== node.updatedAt || previous.bodyBlobHash !== node.bodyBlobHash;
  });
  if (activeId && projection.nodesById[activeId] && !hasUnconfirmedNodeContent(activeId)
      && (!activeNode || !isNodeDocumentLoaded(activeNode) || contentChanged)) {
    const document = await loadWorkspaceNodeDocumentFromRuntime(activeId);
    if (document) projection.nodesById[activeId] = mergeWorkspaceNodeDocument(projection.nodesById[activeId], document);
  }
  for (const nodeId of Object.keys(projection.nodesById)) {
    if (hasUnconfirmedNodeContent(nodeId)) deferNodeContentRefreshUntilPersisted(nodeId, () => {
      if (useWorkspaceStore.getState().libraryScope === libraryScope) {
        requestWorkspaceSyncRefresh({ kind: 'nodes', nodeIds: [nodeId] }, libraryScope);
      }
    });
  }
  useWorkspaceStore.setState(current => current.libraryScope === libraryScope
    ? mergeWorkspaceSyncProjection(current, projection, baseline) : current);
}
