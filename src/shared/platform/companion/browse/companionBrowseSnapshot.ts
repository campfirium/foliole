import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';

const previousInputs = new WeakMap<WorkspaceSnapshot['nodesById'], WorkspaceSnapshot>();

// Browse projections do not consume transient active-node or review-session state.
export function resolveCompanionBrowseSnapshot(snapshot: WorkspaceSnapshot | null) {
  if (!snapshot) return null;
  const previous = previousInputs.get(snapshot.nodesById);
  if (previous && previous.nodeOrder === snapshot.nodeOrder &&
    previous.trashedNodeIds === snapshot.trashedNodeIds &&
    previous.trashedNodeDeletedAtById === snapshot.trashedNodeDeletedAtById &&
    previous.virtualResultIdsByNodeId === snapshot.virtualResultIdsByNodeId &&
    previous.nodeOpenStateById === snapshot.nodeOpenStateById) return previous;
  previousInputs.set(snapshot.nodesById, snapshot);
  return snapshot;
}
