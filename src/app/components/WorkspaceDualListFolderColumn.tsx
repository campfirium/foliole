import { definedProps } from '../../shared/lib/definedProps';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

import type { WorkspaceDualListContentProps } from './WorkspaceDualListContent';
import type { useWorkspaceDualListState } from './workspaceDualListState';
import { WorkspaceFolderColumn } from './WorkspaceFolderColumn';
import { useWorkspaceRenderDiagnostic } from './workspaceInputLagRenderDiagnostic';

export function WorkspaceDualListFolderColumn({
  dualListState,
  onSelectFolderColumnNode,
  props,
  virtualResultCountById
}: {
  dualListState: ReturnType<typeof useWorkspaceDualListState>;
  onSelectFolderColumnNode: (nodeId: string) => void;
  props: WorkspaceDualListContentProps;
  virtualResultCountById: ReadonlyMap<string, number>;
}) {
  const { isDemo } = useDemoRuntimeState();
  useWorkspaceRenderDiagnostic('workspace-dual-list-folder-column-render', {
    activeFolderId: dualListState.activeFolderId,
    folderNodeOrder: dualListState.folderNodeOrder,
    folderNodesById: dualListState.folderNodesById,
    listNodesById: props.listNodesById,
    virtualResultCountById
  });
  return (
    <WorkspaceFolderColumn
      activeFolderId={dualListState.activeFolderId}
      externalEntriesByFolderId={props.externalEntriesByFolderId}
      externalFolders={props.externalFolders}
      externalSelection={props.externalSelection}
      folderNodeOrder={dualListState.folderNodeOrder}
      folderNodesById={dualListState.folderNodesById}
      folderTopicCountById={dualListState.folderTopicCountById}
      forceExpandedFolderId={dualListState.revealFolderId}
      highlightedFolderId={dualListState.revealFolderId}
      hideVirtualSectionInDemo={isDemo}
      isExternalViewOpen={props.isExternalViewOpen}
      isTrashViewOpen={props.isTrashViewOpen}
      isVirtualViewOpen={props.isVirtualViewOpen}
      nodeOrder={props.nodeOrder}
      nodesById={props.listNodesById}
      onOpenMoveToNode={props.onOpenMoveToNode}
      onOpenNotesView={props.onOpenNotesView}
      onOpenExternalSelection={props.onOpenExternalSelection}
      onOpenTrashView={props.onOpenTrashView}
      onSelectNode={onSelectFolderColumnNode}
      onSelectNodeInVirtualView={props.onSelectNodeInVirtualView}
      onSelectTrashNode={props.onSelectTrashNode}
      selectedTrashNodeId={props.selectedTrashNodeId}
      virtualResultCountById={virtualResultCountById}
      {...definedProps({
        activeVirtualNodeId: props.activeVirtualNodeId,
        onOpenExternalLibrarySettings: props.onOpenExternalLibrarySettings,
        onOpenVirtualView: props.onOpenVirtualView
      })}
    />
  );
}
