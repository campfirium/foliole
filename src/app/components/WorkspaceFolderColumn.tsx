import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import { TRASH_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { ExternalLibrarySection } from './ExternalLibrarySection';
import { WorkspaceVirtualSection } from './WorkspaceVirtualSection';

interface WorkspaceFolderColumnProps {
  activeFolderId: string | null;
  activeVirtualNodeId?: string | null;
  hideVirtualSectionInDemo?: boolean;
  externalEntriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  externalFolders: ExternalLibraryFolder[];
  externalSelection: ExternalLibrarySelection;
  isExternalViewOpen: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  forceExpandedFolderId?: string | null;
  highlightedFolderId?: string | null;
  folderNodeOrder: string[];
  folderNodesById: WorkspaceListNodesById;
  folderTopicCountById: ReadonlyMap<string, number>;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onOpenNotesView: () => void;
  onOpenExternalLibrarySettings?: () => void;
  onChangeExternalFolder?: (folderId: string) => void;
  onRemoveExternalFolder?: (folderId: string) => void;
  onRescanExternalFolder?: (folderId: string) => void;
  onOpenTrashView: () => void;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onOpenVirtualView?: (nodeId?: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
  virtualResultCountById?: ReadonlyMap<string, number>;
}

function getActiveFolderSelectionId(props: WorkspaceFolderColumnProps) {
  if (props.isVirtualViewOpen || props.isExternalViewOpen) {
    return null;
  }
  return props.isTrashViewOpen ? TRASH_NODE_ID : props.activeFolderId;
}

function renderRegularSection(props: WorkspaceFolderColumnProps) {
  return (
    <NodeListTree
      activeNodeId={getActiveFolderSelectionId(props)}
      forceExpandedNodeId={props.forceExpandedFolderId ?? null}
      highlightedNodeId={props.highlightedFolderId ?? null}
      isSelectionScopeActive={!props.isVirtualViewOpen && !props.isExternalViewOpen}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodeOrder={props.folderNodeOrder}
      nodesById={props.folderNodesById}
      rowCountByNodeId={props.folderTopicCountById}
      onOpenMoveToNode={props.onOpenMoveToNode}
      onOpenNotesView={props.onOpenNotesView}
      onSelectNode={(nodeId) => {
        if (nodeId === TRASH_NODE_ID) {
          props.onOpenTrashView();
          return;
        }
        if (props.isTrashViewOpen || props.isVirtualViewOpen || props.isExternalViewOpen) {
          props.onOpenNotesView();
        }
        props.onSelectNode(nodeId);
      }}
      onSelectTrashNode={props.onSelectTrashNode}
      selectedTrashNodeId={props.selectedTrashNodeId}
      scrollTargetNodeId={props.highlightedFolderId ?? getActiveFolderSelectionId(props)}
      showTitleSearch={false}
      bodyAppendContent={
        <>
          <WorkspaceVirtualSection
            isVirtualViewOpen={props.isVirtualViewOpen}
            nodeOrder={props.nodeOrder}
            nodesById={props.nodesById}
            onSelectNodeInVirtualView={props.onSelectNodeInVirtualView}
            virtualResultCountById={props.virtualResultCountById}
            {...definedProps({
              activeVirtualNodeId: props.activeVirtualNodeId,
              hideInDemo: props.hideVirtualSectionInDemo,
              onOpenVirtualView: props.onOpenVirtualView
            })}
          />
          <ExternalLibrarySection
            entriesByFolderId={props.externalEntriesByFolderId}
            folders={props.externalFolders}
            isExternalViewOpen={props.isExternalViewOpen}
            onOpenExternalSelection={props.onOpenExternalSelection}
            selection={props.externalSelection}
            {...definedProps({
              onChangeExternalFolder: props.onChangeExternalFolder,
              onOpenExternalLibrarySettings: props.onOpenExternalLibrarySettings,
              onRemoveExternalFolder: props.onRemoveExternalFolder,
              onRescanExternalFolder: props.onRescanExternalFolder
            })}
          />
        </>
      }
    />
  );
}

export function WorkspaceFolderColumn(props: WorkspaceFolderColumnProps) {
  return (
    <div className="workspace-region-main-folder flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{renderRegularSection(props)}</div>
    </div>
  );
}
