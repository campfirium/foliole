import { useState } from 'react';

import type { Dive } from '../../../lib/core/nodes/dive';
import { FolderSectionStack } from '../../features/nodes/components/FolderSectionStack';
import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import { TRASH_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';

import { AddToVirtualFolderDialog } from './AddToVirtualFolderDialog';
import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { ExternalLibrarySection } from './ExternalLibrarySection';
import type { DiveSourceSelection } from './useWorkspaceDiveRows';
import { useWorkspaceAddToDive } from './WorkspaceAddToDive';
import { WorkspaceDiveSection } from './WorkspaceDiveSection';
import { WorkspaceVirtualSection } from './WorkspaceVirtualSection';

import './workspace-folder-root-rows.css';

interface WorkspaceFolderColumnProps {
  dives: readonly Dive[];
  activeDiveId: string | null;
  activeDiveSource: DiveSourceSelection | null;
  onSelectDiveSource: (diveId: string, nodeId: string) => void;
  onSelectDive: (id: string) => void;
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

function isNonRegularFolderViewOpen(props: WorkspaceFolderColumnProps) {
  return props.isTrashViewOpen || props.isVirtualViewOpen || props.isExternalViewOpen;
}

function selectRegularNode(props: WorkspaceFolderColumnProps, nodeId: string) {
  if (nodeId === TRASH_NODE_ID) {
    props.onOpenTrashView();
    return;
  }
  if (isNonRegularFolderViewOpen(props)) {
    props.onOpenNotesView();
  }
  props.onSelectNode(nodeId);
}

function renderFolderSections(props: WorkspaceFolderColumnProps) {
  return (
    <>
      <WorkspaceDiveSection
        activeDiveId={props.activeDiveId}
        dives={props.dives}
        onSelectDive={props.onSelectDive}
        activeSource={props.activeDiveSource}
        nodesById={props.nodesById}
        onSelectNode={props.onSelectDiveSource}
      />
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
  );
}

function renderRegularSection(
  props: WorkspaceFolderColumnProps,
  onAddToDive: ReturnType<typeof useWorkspaceAddToDive>['open'],
  onAddToVirtualFolder: (ids: string[]) => void
) {
  const isDiveEntryActive = Boolean(props.activeDiveId || props.activeDiveSource);
  const activeNodeId = isDiveEntryActive ? null : getActiveFolderSelectionId(props);
  const highlightedNodeId = isDiveEntryActive ? null : (props.highlightedFolderId ?? null);
  return (
    <NodeListTree
      activeNodeId={activeNodeId}
      forceExpandedNodeId={isDiveEntryActive ? null : (props.forceExpandedFolderId ?? null)}
      highlightedNodeId={highlightedNodeId}
      isSelectionScopeActive={!isDiveEntryActive && !props.isVirtualViewOpen && !props.isExternalViewOpen}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodeOrder={props.folderNodeOrder}
      nodesById={props.folderNodesById}
      rowCountByNodeId={props.folderTopicCountById}
      onAddToVirtualFolder={onAddToVirtualFolder}
      {...(onAddToDive ? { onAddToDive } : {})}
      onOpenMoveToNode={props.onOpenMoveToNode}
      onOpenNotesView={props.onOpenNotesView}
      onSelectNode={(nodeId) => selectRegularNode(props, nodeId)}
      onSelectTrashNode={props.onSelectTrashNode}
      selectedTrashNodeId={props.selectedTrashNodeId}
      scrollTargetNodeId={highlightedNodeId ?? activeNodeId}
      showTitleSearch={false}
      bodyAppendContent={renderFolderSections(props)}
    />
  );
}

export function WorkspaceFolderColumn(props: WorkspaceFolderColumnProps) {
  const addToDive = useWorkspaceAddToDive();
  const [virtualSourceIds, setVirtualSourceIds] = useState<string[] | null>(null);
  const tree = renderRegularSection(props, addToDive.open, setVirtualSourceIds);
  return (
    <div className="workspace-folder-column workspace-region-main-folder flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{props.hideVirtualSectionInDemo ? tree : <FolderSectionStack>{tree}</FolderSectionStack>}</div>
      {addToDive.dialog}
      {virtualSourceIds ? <AddToVirtualFolderDialog sourceIds={virtualSourceIds} onClose={() => setVirtualSourceIds(null)} /> : null}
    </div>
  );
}
