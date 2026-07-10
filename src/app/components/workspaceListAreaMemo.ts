import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic
} from '../../store/workspaceEditorInputDiagnostics';

import type { WorkspaceListAreaProps } from './WorkspaceLayoutGridSections';

export function areWorkspaceListAreaPropsEqual(
  previous: WorkspaceListAreaProps,
  next: WorkspaceListAreaProps
) {
  const changed = {
    activeNodeId: previous.activeNodeId !== next.activeNodeId,
    activeVirtualNodeId: previous.activeVirtualNodeId !== next.activeVirtualNodeId,
    externalEntriesByFolderId: previous.externalEntriesByFolderId !== next.externalEntriesByFolderId,
    externalFolders: previous.externalFolders !== next.externalFolders,
    externalSelection: previous.externalSelection !== next.externalSelection,
    isExternalViewOpen: previous.isExternalViewOpen !== next.isExternalViewOpen,
    isStudyMode: previous.isStudyMode !== next.isStudyMode,
    isTrashViewOpen: previous.isTrashViewOpen !== next.isTrashViewOpen,
    isVirtualViewOpen: previous.isVirtualViewOpen !== next.isVirtualViewOpen,
    isWorkspaceHydrated: previous.isWorkspaceHydrated !== next.isWorkspaceHydrated,
    listNodesById: previous.listNodesById !== next.listNodesById,
    manualVirtualCollections: previous.manualVirtualCollections !== next.manualVirtualCollections,
    nodeOrder: previous.nodeOrder !== next.nodeOrder,
    reviewCurrentNodeId: previous.reviewCurrentNodeId !== next.reviewCurrentNodeId,
    selectedTrashNodeId: previous.selectedTrashNodeId !== next.selectedTrashNodeId,
    trashedNodeIds: previous.trashedNodeIds !== next.trashedNodeIds,
    virtualNodesById: previous.isVirtualViewOpen && previous.nodesById !== next.nodesById
  };
  if (isEditorInputDiagnosticEnabled()) {
    logEditorInputDiagnostic('workspace-list-area-memo-compare', changed);
  }
  return !Object.values(changed).some(Boolean);
}
