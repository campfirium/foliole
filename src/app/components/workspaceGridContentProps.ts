import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder
} from '../../shared/platform/externalSearchBridge';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';
import type { WorkspaceGridColumnProps } from './workspaceLayoutGridContentColumns';
import type { WorkspaceListAreaProps } from './WorkspaceLayoutGridSections';
import type { WorkspaceListSplitterProps } from './WorkspaceListSplitter';
import type { WorkspaceRightSidebarProps } from './WorkspaceRightSidebar';
import type { WorkspaceRightSidebarSplitterProps } from './WorkspaceRightSidebarSplitter';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export interface WorkspaceGridContentProjectionSource {
  activeNodeId: string | null;
  activeVirtualNodeId?: string | null;
  externalEntriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>;
  externalFolders: RuntimeExternalSearchFolder[];
  externalSelection: ExternalLibrarySelection;
  isExternalViewOpen: boolean;
  isImmersiveMode: boolean;
  isListCollapsed: boolean;
  isResizingList: boolean;
  isResizingRightSidebar: boolean;
  isRightSidebarCollapsed: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  isWorkspaceHydrated?: boolean;
  listWidth: number;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onOpenExternalLibrarySettings: () => void;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onOpenMoveToNode: () => void;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onOpenVirtualView: (nodeId?: string) => void;
  onResetLayout: () => void;
  onRevealAnchorInDocument: (anchor: NodeAnchorLink) => void;
  onRevealDocumentPosition: (position: number) => void;
  onRightSidebarSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRightSidebarSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  onSelectNodeInVirtualView: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  onSelectTrashNode: (nodeId: string) => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  reviewCurrentNodeId: string | null;
  reviewPanelQueueNodeIds: string[];
  reviewSchedulerSettings: ReviewSchedulerSettings;
  rightSidebarWidth: number;
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
}

export function selectWorkspaceGridColumnProps({
  activeRightPanelId,
  documentNodeId,
  documentSurfaceProps,
  listNodesById,
  outlineActivePosition,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  documentSurfaceProps: WorkspaceDocumentSurfaceProps;
  listNodesById: WorkspaceListNodesById;
  outlineActivePosition: number;
  onSelectNode: WorkspaceGridContentProjectionSource['onSelectNode'];
  props: WorkspaceGridContentProjectionSource;
}): WorkspaceGridColumnProps {
  return {
    documentSurfaceProps,
    isImmersiveMode: props.isImmersiveMode,
    isListCollapsed: props.isListCollapsed,
    isRightSidebarCollapsed: props.isRightSidebarCollapsed,
    listAreaProps: selectWorkspaceListAreaProps({ listNodesById, onSelectNode, props }),
    listSplitterProps: selectWorkspaceListSplitterProps(props),
    rightSidebarProps: selectWorkspaceRightSidebarProps({
      activeRightPanelId,
      documentNodeId,
      outlineActivePosition,
      onSelectNode,
      props
    }),
    rightSidebarSplitterProps: selectWorkspaceRightSidebarSplitterProps(props)
  };
}

function selectWorkspaceListAreaProps({
  listNodesById,
  onSelectNode,
  props
}: {
  listNodesById: WorkspaceListNodesById;
  onSelectNode: WorkspaceGridContentProjectionSource['onSelectNode'];
  props: WorkspaceGridContentProjectionSource;
}): WorkspaceListAreaProps {
  return {
    activeNodeId: props.activeNodeId,
    activeVirtualNodeId: props.activeVirtualNodeId ?? null,
    externalEntriesByFolderId: props.externalEntriesByFolderId,
    externalFolders: props.externalFolders,
    externalSelection: props.externalSelection,
    isExternalViewOpen: props.isExternalViewOpen,
    isTrashViewOpen: props.isTrashViewOpen,
    isVirtualViewOpen: props.isVirtualViewOpen,
    isWorkspaceHydrated: props.isWorkspaceHydrated,
    listNodesById,
    nodesById: props.nodesById,
    nodeOrder: props.nodeOrder,
    onOpenMoveToNode: props.onOpenMoveToNode,
    onOpenNotesView: props.onOpenNotesView,
    onOpenExternalSelection: props.onOpenExternalSelection,
    onOpenExternalLibrarySettings: props.onOpenExternalLibrarySettings,
    onOpenTrashView: props.onOpenTrashView,
    onOpenVirtualView: props.onOpenVirtualView,
    onSelectNode,
    onSelectNodeInVirtualView: props.onSelectNodeInVirtualView,
    onSelectTrashNode: props.onSelectTrashNode,
    selectedTrashNodeId: props.selectedTrashNodeId,
    trashedNodeIds: props.trashedNodeIds
  };
}

function selectWorkspaceListSplitterProps(
  props: WorkspaceGridContentProjectionSource
): WorkspaceListSplitterProps {
  return {
    isCollapsed: props.isListCollapsed,
    isResizingList: props.isResizingList,
    listWidth: props.listWidth,
    onResetLayout: props.onResetLayout,
    onSplitterKeyDown: props.onSplitterKeyDown,
    onSplitterPointerDown: props.onSplitterPointerDown
  };
}

function selectWorkspaceRightSidebarProps({
  activeRightPanelId,
  documentNodeId,
  outlineActivePosition,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  outlineActivePosition: number;
  onSelectNode: WorkspaceGridContentProjectionSource['onSelectNode'];
  props: WorkspaceGridContentProjectionSource;
}): WorkspaceRightSidebarProps {
  return {
    activePanelId: activeRightPanelId,
    activeNodeId: documentNodeId,
    outlineActivePosition,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    onRevealAnchorInDocument: props.onRevealAnchorInDocument,
    onRevealDocumentPosition: props.onRevealDocumentPosition,
    onSelectBreadcrumbNode: props.onSelectBreadcrumbNode,
    onSelectNode,
    reviewCurrentNodeId: props.reviewCurrentNodeId,
    reviewQueueNodeIds: props.reviewPanelQueueNodeIds,
    reviewSchedulerSettings: props.reviewSchedulerSettings,
    trashedNodeIds: props.trashedNodeIds
  };
}

function selectWorkspaceRightSidebarSplitterProps(
  props: WorkspaceGridContentProjectionSource
): WorkspaceRightSidebarSplitterProps {
  return {
    isCollapsed: props.isRightSidebarCollapsed,
    isResizingRightSidebar: props.isResizingRightSidebar,
    onResetLayout: props.onResetLayout,
    onRightSidebarSplitterKeyDown: props.onRightSidebarSplitterKeyDown,
    onRightSidebarSplitterPointerDown: props.onRightSidebarSplitterPointerDown,
    rightSidebarWidth: props.rightSidebarWidth
  };
}
