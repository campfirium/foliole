import type { VirtualNodeResultIndex } from '../../features/nodes/model/virtualNodeDetail';
import { definedProps } from '../../shared/lib/definedProps';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

import { VirtualNodeConversionResults } from './useVirtualNodeResultIndex';
import type { WorkspaceDualListContentProps } from './WorkspaceDualListContent';
import type { useWorkspaceDualListState } from './workspaceDualListState';
import { WorkspaceFolderColumn } from './WorkspaceFolderColumn';
import { useWorkspaceRenderDiagnostic } from './workspaceInputLagRenderDiagnostic';

interface WorkspaceDualListFolderColumnProps {
  diveNavigation: Pick<Parameters<typeof WorkspaceFolderColumn>[0], 'activeDiveId' | 'dives' | 'onSelectDive'>;
  dualListState: ReturnType<typeof useWorkspaceDualListState>;
  onSelectFolderColumnNode: (nodeId: string) => void;
  props: WorkspaceDualListContentProps;
  virtualResultIndex: VirtualNodeResultIndex;
}

export function WorkspaceDualListFolderColumn({
  diveNavigation, dualListState, onSelectFolderColumnNode, props, virtualResultIndex
}: WorkspaceDualListFolderColumnProps) {
  const { isDemo } = useDemoRuntimeState();
  const { countById: virtualResultCountById, resultIdsByVirtualId } = virtualResultIndex;
  useWorkspaceRenderDiagnostic('workspace-dual-list-folder-column-render', {
    activeFolderId: dualListState.activeFolderId,
    folderNodeOrder: dualListState.folderNodeOrder,
    folderNodesById: dualListState.folderNodesById,
    listNodesById: props.listNodesById,
    virtualResultCountById
  });
  return (
    <VirtualNodeConversionResults.Provider value={{ resultIdsByVirtualId, nodesById: props.nodesById }}>
      <WorkspaceFolderColumn
        {...diveNavigation}
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
          onChangeExternalFolder: props.onChangeExternalFolder,
          onOpenExternalLibrarySettings: props.onOpenExternalLibrarySettings,
          onOpenVirtualView: props.onOpenVirtualView,
          onRemoveExternalFolder: props.onRemoveExternalFolder,
          onRescanExternalFolder: props.onRescanExternalFolder
        })}
      />
    </VirtualNodeConversionResults.Provider>
  );
}
