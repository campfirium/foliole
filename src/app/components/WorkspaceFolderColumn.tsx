import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import { TRASH_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder
} from '../../shared/platform/externalSearchBridge';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { ExternalLibrarySection } from './ExternalLibrarySection';
import { WorkspaceVirtualSection } from './WorkspaceVirtualSection';

interface WorkspaceFolderColumnProps {
  activeFolderId: string | null;
  activeVirtualNodeId?: string | null;
  externalEntriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>;
  externalFolders: RuntimeExternalSearchFolder[];
  externalSelection: ExternalLibrarySelection;
  isExternalViewOpen: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  folderNodeOrder: string[];
  folderNodesById: WorkspaceListNodesById;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onOpenVirtualView?: (nodeId?: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
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
      isSelectionScopeActive={!props.isVirtualViewOpen && !props.isExternalViewOpen}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      key={
        props.isVirtualViewOpen
          ? 'regular-hidden-by-virtual'
          : props.isExternalViewOpen
            ? 'regular-hidden-by-external'
            : props.isTrashViewOpen
              ? 'regular-trash'
              : 'regular-notes'
      }
      nodeOrder={props.folderNodeOrder}
      nodesById={props.folderNodesById}
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
      showTitleSearch={false}
      bodyAppendContent={
        <>
          <WorkspaceVirtualSection
            activeVirtualNodeId={props.activeVirtualNodeId}
            isVirtualViewOpen={props.isVirtualViewOpen}
            nodeOrder={props.nodeOrder}
            nodesById={props.nodesById}
            onOpenVirtualView={props.onOpenVirtualView}
            onSelectNodeInVirtualView={props.onSelectNodeInVirtualView}
          />
          <ExternalLibrarySection
            entriesByFolderId={props.externalEntriesByFolderId}
            folders={props.externalFolders}
            isExternalViewOpen={props.isExternalViewOpen}
            onOpenExternalSelection={props.onOpenExternalSelection}
            selection={props.externalSelection}
          />
        </>
      }
    />
  );
}

export function WorkspaceFolderColumn(props: WorkspaceFolderColumnProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-panel">
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{renderRegularSection(props)}</div>
    </div>
  );
}
