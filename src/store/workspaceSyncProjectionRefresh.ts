import type { WorkspaceRefreshScope } from '../../lib/core/database/workspaceSnapshotRefresh';
import { loadWorkspaceListProjectionFromRuntime } from '../shared/platform/desktop/workspaceListProjectionRuntimeRepository';
import { loadWorkspaceNodeDocumentFromRuntime } from '../shared/platform/workspaceRuntimeRepository';

import { hasUnconfirmedNodeContent } from './workspaceNodeContentVersionGuard';
import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';
import { useWorkspaceStore } from './workspaceStore';
import { mergeWorkspaceSyncProjection, projectionChangesStructure } from './workspaceSyncProjectionMerge';

type NodeScope = Extract<WorkspaceRefreshScope, { kind: 'nodes' }>;

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
  let projection = await loadWorkspaceListProjectionFromRuntime(
    { nodeIds: [...roots], structure: scope.structure === true, libraryScope, ancestorNodeIds });
  if (!projection.structure && projectionChangesStructure(baseline, projection)) {
    projection = await loadWorkspaceListProjectionFromRuntime(
      { nodeIds: [...roots], structure: true, libraryScope, ancestorNodeIds });
  }
  const missing = projection.structure?.memberIds.filter(id => !baseline.nodesById[id] && !projection.nodesById[id]) ?? [];
  if (missing.length) {
    projection = await loadWorkspaceListProjectionFromRuntime(
      { nodeIds: [...roots, ...missing], structure: true, libraryScope, ancestorNodeIds });
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
  useWorkspaceStore.setState(current => current.libraryScope === libraryScope
    ? mergeWorkspaceSyncProjection(current, projection, baseline) : current);
}
