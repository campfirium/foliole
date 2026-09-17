import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { createWorkspaceNodeMutationPatch } from './workspaceNodeMutationPatch';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

export function applyRuntimeAnchorAcknowledgements(
  set: WorkspaceSet,
  result: WorkspaceNodeMutationPatchResult | null
) {
  if (!result?.anchorUpdates?.length) return;
  const anchorUpdates = result.anchorUpdates;
  const updatedNodes: WorkspaceState['nodesById'][string][] = [];
  set((state) => {
    const patch = createWorkspaceNodeMutationPatch(state, {
      anchorUpdates,
      nodes: []
    });
    anchorUpdates.forEach((update) => {
      const node = patch.nodesById?.[update.nodeId];
      if (node) updatedNodes.push(node);
    });
    return patch;
  });
  updatedNodes.forEach(syncWorkspaceNodeDocumentCacheFromNode);
}
