import { saveNodeOpenStateToRuntime } from '../shared/platform/runtime/nodeOpenStateRuntimeRepository';

import type { WorkspaceState } from './workspaceStoreTypes';

type WorkspaceSet = (
  partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)
) => void;

export async function persistNodeOpened(set: WorkspaceSet, nodeId: string, openedAt: string) {
  const persisted = await saveNodeOpenStateToRuntime(nodeId, openedAt);
  if (!persisted) return;
  set((state) => ({
    nodeOpenStateById: {
      ...state.nodeOpenStateById,
      [nodeId]: persisted
    }
  }));
}
