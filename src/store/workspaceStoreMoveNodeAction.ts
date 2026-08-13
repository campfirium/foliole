import type { WorkspaceMoveNodesResult } from '../shared/platform/workspaceRuntimeTypes';

import type { WorkspaceState } from './workspaceStore';
import { createMoveNodesAction, type MoveNodesRuntimePayload } from './workspaceStoreTreeActions';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
export function createMoveNodeAction(
  set: WorkspaceSet,
  onNodesMoved?: (payload: MoveNodesRuntimePayload) => Promise<WorkspaceMoveNodesResult | undefined>
): WorkspaceState['moveNode'] {
  const moveNodes = createMoveNodesAction(set, onNodesMoved);
  return (nodeId, nextParentNodeId) => moveNodes([nodeId], nextParentNodeId, 'child');
}
