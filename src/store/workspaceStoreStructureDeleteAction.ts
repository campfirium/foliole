import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { pushWorkspaceUndoEntry } from './workspaceActionHistory';
import type { WorkspaceState } from './workspaceStore';
import { createStructureDeleteEntry, isWorkspaceStructureKind } from './workspaceStructureHistoryEntries';
import { computeDeleteNodesMutation, type DeleteNodeMutationResult } from './workspaceTrashMutations';
import { commitSoftDeleteMutation, type TrashRuntimeHandlers } from './workspaceTrashRuntimeCommit';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

const TRASH_NOTICE_DURATION_MS = 8000;

function getTrashNoticeMessage(kind: 'folder' | 'topic') {
  return `${kind === 'folder' ? 'Folder' : 'Topic'} moved to Trash`;
}

function showTrashUndoNotice(entry: NonNullable<ReturnType<typeof createStructureDeleteEntry>>, get: () => WorkspaceState) {
  showAppRuntimeNotice(
    getTrashNoticeMessage(entry.kind),
    'success',
    {
      label: 'Undo',
      onSelect: () => { get().undoWorkspaceAction(entry.id); }
    },
    {
      durationMs: TRASH_NOTICE_DURATION_MS,
      presentation: 'trash-row'
    }
  );
}

export function createDeleteNodesAction(
  set: WorkspaceSet,
  runtimeHandlers: TrashRuntimeHandlers,
  get?: () => WorkspaceState
): WorkspaceState['deleteNodes'] {
  return async (nodeIds) => {
    let mutation: DeleteNodeMutationResult | null = null;
    let beforeActiveNodeId: string | null = null;
    let rootNodeId: string | null = null;
    let rootKind: 'folder' | 'topic' | null = null;
    set((state) => {
      mutation = computeDeleteNodesMutation(state, nodeIds);
      const candidateRootId = mutation?.nodeIds[0] ?? null;
      const candidateKind = candidateRootId ? state.nodesById[candidateRootId]?.kind : null;
      if (candidateRootId && candidateKind && isWorkspaceStructureKind(candidateKind)) {
        beforeActiveNodeId = state.activeNodeId;
        rootNodeId = candidateRootId;
        rootKind = candidateKind;
      }
      return state;
    });
    const pendingMutation = mutation as DeleteNodeMutationResult | null;
    const deletedAt = pendingMutation?.deletedAt;
    const result = await commitSoftDeleteMutation(runtimeHandlers, pendingMutation);
    let historyEntry: ReturnType<typeof createStructureDeleteEntry> | null = null;
    set((state) => {
      if (!pendingMutation || !deletedAt || !result) return state;
      const committed = computeDeleteNodesMutation(state, result.deletedNodeIds, deletedAt);
      if (!committed || committed.nodeIds.length !== pendingMutation.nodeIds.length ||
          !committed.nodeIds.every((nodeId) => pendingMutation.nodeIds.includes(nodeId))) return state;
      if (rootNodeId && rootKind) {
        historyEntry = createStructureDeleteEntry({
          afterActiveNodeId: committed.patch.activeNodeId,
          beforeActiveNodeId,
          kind: rootKind,
          nodeIds: committed.nodeIds,
          rootNodeId
        });
      }
      return {
        ...committed.patch,
        ...(historyEntry ? { appActionHistory: pushWorkspaceUndoEntry(state.appActionHistory, historyEntry) } : {})
      };
    });
    const committedEntry = historyEntry as ReturnType<typeof createStructureDeleteEntry> | null;
    if (committedEntry && get) {
      showTrashUndoNotice(committedEntry, get);
    }
  };
}
