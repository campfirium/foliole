import { definedProps } from '../../shared/lib/definedProps';

import type { WorkspaceDualListContentProps } from './WorkspaceDualListContent';
import type { useWorkspaceDualListState } from './workspaceDualListState';
import { WorkspaceFolderColumn } from './WorkspaceFolderColumn';

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
