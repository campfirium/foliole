import { HOME_NODE_ID, TRASH_NODE_ID } from '../features/nodes/model/specialNodes';
import { saveNodeOpenStateToRuntime } from '../shared/platform/runtime/nodeOpenStateRuntimeRepository';

import type { WorkspaceState } from './workspaceStoreTypes';

type WorkspaceSet = (
  partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)
) => void;

export async function persistNodeOpened(set: WorkspaceSet, nodeId: string, openedAt: string) {
  if (nodeId === HOME_NODE_ID || nodeId === TRASH_NODE_ID) return;
  const persisted = await saveNodeOpenStateToRuntime(nodeId, openedAt);
  if (!persisted) return;
  set((state) => ({
    nodeOpenStateById: {
      ...state.nodeOpenStateById,
      [nodeId]: persisted
    }
  }));
}
