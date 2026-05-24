import { normalizeManualChildOrder, updateFolderManualChildOrder } from '../features/nodes/model/manualChildOrder';

import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export function createSetFolderManualChildOrderAction(set: WorkspaceSet) {
  return (folderNodeId: string, manualChildOrder: string[], now = new Date().toISOString()) => {
    let nextFolder: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const folder = state.nodesById[folderNodeId];
      if (!folder || folder.kind !== 'folder') {
        return state;
      }
      const nextNode = updateFolderManualChildOrder(folder, normalizeManualChildOrder(manualChildOrder), now);
      if (nextNode === folder) {
        return state;
      }
      nextFolder = nextNode;
      return {
        nodesById: {
          ...state.nodesById,
          [folderNodeId]: nextNode
        }
      };
    });
    if (nextFolder) {
      syncNodeContentToRuntime(nextFolder);
      return true;
    }
    return false;
  };
}
