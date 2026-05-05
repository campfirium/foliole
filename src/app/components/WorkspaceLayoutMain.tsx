import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';

import { ImmersiveShortcutsOverlay } from './ImmersiveShortcutsOverlay';
import { ImportSourceWorkspace } from './ImportSourceWorkspace';
import { useImmersiveReadingMode } from './useImmersiveReadingMode';
import { WindowTitleBar } from './WindowTitleBar';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceLayoutGrid } from './WorkspaceLayoutGrid';
import {
  loadWorkspaceRightPanelPreference,
  saveWorkspaceRightPanelPreference
} from './workspaceRightPanelPreference';
import { WorkspaceSettingsOverlay } from './WorkspaceSettingsOverlay';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

function resolveWindowTitleBarTitle(nodeId: string | null, nodesById: WorkspaceLayoutProps['nodesById']) {
  if (!nodeId) {
    return null;
  }

  let cursor = nodesById[nodeId];
  if (!cursor) {
    return null;
  }
  if (cursor.kind === 'folder') {
    return cursor.title.trim() || 'Untitled';
  }

  while (cursor.parentNodeId) {
    const parent = nodesById[cursor.parentNodeId];
    if (!parent || parent.kind === 'folder') {
      break;
    }
    cursor = parent;
  }

  return cursor.title.trim() || 'Untitled';
}

function useWorkspaceSurfaceActions(props: WorkspaceLayoutProps) {
  const handleOpenNotesView = useCallback(() => {
    props.onCloseImportManagement();
    props.onOpenNotesView();
  }, [props.onCloseImportManagement, props.onOpenNotesView]);
  const handleOpenVirtualView = useCallback(() => {
    props.onCloseImportManagement();
    props.onOpenVirtualView();
  }, [props.onCloseImportManagement, props.onOpenVirtualView]);
  const handleOpenTrashView = useCallback(() => {
    props.onCloseImportManagement();
    props.onOpenTrashView();
  }, [props.onCloseImportManagement, props.onOpenTrashView]);
  const handleSelectNode = useCallback((nodeId: string, focusAnchor?: NodeAnchorLink | null) => {
    props.onCloseImportManagement();
    props.onSelectNode(nodeId, focusAnchor);
  }, [props.onCloseImportManagement, props.onSelectNode]);
  return {
    handleOpenNotesView,
    handleOpenVirtualView,
    handleOpenTrashView,
    handleSelectNode
  };
}

export function WorkspaceLayoutMain(props: WorkspaceLayoutProps) {
  const [activeRightPanelId, setActiveRightPanelId] = useState<WorkspaceRightPanelId>(() =>
    loadWorkspaceRightPanelPreference()
  );
  const immersive = useImmersiveReadingMode(props);
  const { handleOpenNotesView, handleOpenVirtualView, handleOpenTrashView, handleSelectNode } = useWorkspaceSurfaceActions(props);
  const workspaceGridStyle = {
    '--workspace-list-width': `${props.listWidth}px`,
    '--workspace-list-current-width': props.isListCollapsed ? '0px' : `${props.listWidth}px`,
    '--workspace-list-splitter-width': props.isListCollapsed ? '0px' : '1px',
    '--workspace-right-sidebar-current-width': props.isRightSidebarCollapsed ? '0px' : `${props.rightSidebarWidth}px`,
    '--workspace-right-sidebar-splitter-width': props.isRightSidebarCollapsed ? '0px' : '1px',
    '--workspace-right-sidebar-width': `${props.rightSidebarWidth}px`
  } as CSSProperties;
  const documentNodeId = props.isViewingTrashNode ? props.selectedTrashNodeId : props.activeNodeId;

  useEffect(() => {
    saveWorkspaceRightPanelPreference(activeRightPanelId);
  }, [activeRightPanelId]);

  const handleSelectRightPanel = useCallback((panelId: WorkspaceRightPanelId) => {
    setActiveRightPanelId(panelId);
    if (props.isRightSidebarCollapsed) {
      props.onToggleRightSidebarVisibility();
    }
  }, [props.isRightSidebarCollapsed, props.onToggleRightSidebarVisibility]);

  return (
    <main aria-label="Foliole workspace" className="relative flex h-dvh flex-col overflow-hidden p-0" style={workspaceGridStyle}>
      <WorkspaceMainChrome
        activeRightPanelId={activeRightPanelId}
        onOpenNotesView={handleOpenNotesView}
        onOpenVirtualView={handleOpenVirtualView}
        onOpenTrashView={handleOpenTrashView}
        isImportManagementOpen={props.isImportManagementOpen}
        onSelectRightPanel={handleSelectRightPanel}
        documentNodeId={documentNodeId}
        onOpenImportManagement={props.onOpenImportManagement}
        onStartClipboardImport={props.onStartClipboardImport}
        onStartImport={() => void props.onRunImportFile()}
        onSelectNode={handleSelectNode}
        immersive={immersive}
        props={props}
      />
      <ImmersiveShortcutsOverlay visible={props.isImmersiveMode && !immersive.isImmersiveEditing && immersive.isShortcutsOverlayOpen} />
      <ImportSourceWorkspace
        onOpenChange={(open) => (open ? props.onOpenImportManagement() : props.onCloseImportManagement())}
        onSelectNode={handleSelectNode}
        open={props.isImportManagementOpen}
      />
      <WorkspaceSettingsOverlay props={props} />
    </main>
  );
}

function WorkspaceListDivider({ isListCollapsed }: { isListCollapsed: boolean }) {
  if (isListCollapsed) {
    return null;
  }
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-border max-[1080px]:hidden"
      style={{ left: 'calc(var(--workspace-rail-width) + var(--workspace-list-width, 300px))' }}
    />
  );
}

function renderWorkspaceTitleBar(args: {
  activeRightPanelId: WorkspaceRightPanelId;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onOpenVirtualView: () => void;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  props: WorkspaceLayoutProps;
}) {
  if (args.props.isImmersiveMode) {
    return null;
  }
  return (
    <WindowTitleBar
      activeRightPanelId={args.activeRightPanelId}
      centerTitle={resolveWindowTitleBarTitle(
        args.props.isViewingTrashNode ? args.props.selectedTrashNodeId : args.props.activeNodeId,
        args.props.nodesById
      )}
      isListCollapsed={args.props.isListCollapsed}
      isRightSidebarCollapsed={args.props.isRightSidebarCollapsed}
      isTrashViewOpen={args.props.isTrashViewOpen}
      isVirtualViewOpen={args.props.isVirtualViewOpen}
      listWidth={args.props.listWidth}
      onOpenNotesView={args.onOpenNotesView}
      onOpenVirtualView={args.onOpenVirtualView}
      onOpenTrashView={args.onOpenTrashView}
      onSelectRightPanel={args.onSelectRightPanel}
      onToggleListVisibility={args.props.onToggleListVisibility}
      onToggleRightSidebarVisibility={args.props.onToggleRightSidebarVisibility}
      rightSidebarWidth={args.props.rightSidebarWidth}
    />
  );
}

function renderWorkspaceGrid(args: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  immersive: ReturnType<typeof useImmersiveReadingMode>;
  isImportManagementOpen: boolean;
  onEnterImmersiveEdit: () => void;
  onOpenImportManagement: () => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  props: WorkspaceLayoutProps;
}) {
  const shouldSuppressSelectionRestore = () =>
    args.immersive.shouldSuppressSelectionRestore() || args.props.shouldSuppressNavigationSelectionRestore();

  return (
    <WorkspaceLayoutGrid
      activeRightPanelId={args.activeRightPanelId}
      documentNodeId={args.documentNodeId}
      isImmersiveEditing={args.immersive.isImmersiveEditing}
      isImportManagementOpen={args.isImportManagementOpen}
      onEnterImmersiveEdit={args.onEnterImmersiveEdit}
      onOpenImportManagement={args.onOpenImportManagement}
      onSelectNode={args.onSelectNode}
      onShouldSuppressSelectionRestore={shouldSuppressSelectionRestore}
      onStartClipboardImport={args.onStartClipboardImport}
      onStartImport={args.onStartImport}
      props={args.props}
    />
  );
}

function WorkspaceMainChrome({
  activeRightPanelId,
  documentNodeId,
  isImportManagementOpen,
  onOpenImportManagement,
  onOpenNotesView,
  onOpenVirtualView,
  onOpenTrashView,
  onSelectNode,
  onSelectRightPanel,
  onStartClipboardImport,
  onStartImport,
  immersive,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImportManagementOpen: boolean;
  onOpenImportManagement: () => void;
  onOpenNotesView: () => void;
  onOpenVirtualView: () => void;
  onOpenTrashView: () => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  props: WorkspaceLayoutProps;
  immersive: ReturnType<typeof useImmersiveReadingMode>;
}) {
  return (
    <>
      {props.isImmersiveMode ? null : <WorkspaceListDivider isListCollapsed={props.isListCollapsed} />}
      {renderWorkspaceTitleBar({
        activeRightPanelId,
        onOpenNotesView,
        onOpenTrashView,
        onOpenVirtualView,
        onSelectRightPanel,
        props
      })}
      {renderWorkspaceGrid({
        activeRightPanelId,
        documentNodeId,
        immersive,
        isImportManagementOpen,
        onEnterImmersiveEdit: immersive.enterImmersiveEdit,
        onOpenImportManagement,
        onSelectNode,
        onStartClipboardImport,
        onStartImport,
        props
      })}
    </>
  );
}
