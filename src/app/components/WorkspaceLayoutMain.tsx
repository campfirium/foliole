import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';
import { WindowTitleBar } from './WindowTitleBar';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceLayoutGrid } from './WorkspaceLayoutGrid';
import {
  loadWorkspaceRightPanelPreference,
  saveWorkspaceRightPanelPreference
} from './workspaceRightPanelPreference';
import { WorkspaceSettingsOverlay } from './WorkspaceSettingsOverlay';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

function useWorkspaceSurfaceActions(props: WorkspaceLayoutProps) {
  const handleOpenNotesView = () => {
    props.onCloseImportManagement();
    props.onOpenNotesView();
  };
  const handleOpenVirtualView = () => {
    props.onCloseImportManagement();
    props.onOpenVirtualView();
  };
  const handleOpenTrashView = () => {
    props.onCloseImportManagement();
    props.onOpenTrashView();
  };
  const handleSelectNode = (nodeId: string) => {
    props.onCloseImportManagement();
    props.onSelectNode(nodeId);
  };
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
  const { handleOpenNotesView, handleOpenVirtualView, handleOpenTrashView, handleSelectNode } = useWorkspaceSurfaceActions(props);
  const workspaceGridStyle = {
    '--workspace-list-width': `${props.listWidth}px`,
    '--workspace-right-sidebar-width': `${props.rightSidebarWidth}px`
  } as CSSProperties;
  const documentNodeId = props.isViewingTrashNode ? props.selectedTrashNodeId : props.activeNodeId;

  useEffect(() => {
    saveWorkspaceRightPanelPreference(activeRightPanelId);
  }, [activeRightPanelId]);

  const handleSelectRightPanel = (panelId: WorkspaceRightPanelId) => {
    setActiveRightPanelId(panelId);
    if (props.isRightSidebarCollapsed) {
      props.onToggleRightSidebarVisibility();
    }
  };

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
        props={props}
      />
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
      style={{ left: 'calc(40px + var(--workspace-list-width, 300px))' }}
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
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImportManagementOpen: boolean;
  onOpenImportManagement: () => void;
  onOpenNotesView: () => void;
  onOpenVirtualView: () => void;
  onOpenTrashView: () => void;
  onSelectNode: (nodeId: string) => void;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  props: WorkspaceLayoutProps;
}) {
  return (
    <>
      <WorkspaceListDivider isListCollapsed={props.isListCollapsed} />
      <WindowTitleBar
        activeRightPanelId={activeRightPanelId}
        isListCollapsed={props.isListCollapsed}
        isRightSidebarCollapsed={props.isRightSidebarCollapsed}
        isTrashViewOpen={props.isTrashViewOpen}
        isVirtualViewOpen={props.isVirtualViewOpen}
        listWidth={props.listWidth}
        onOpenNotesView={onOpenNotesView}
        onOpenVirtualView={onOpenVirtualView}
        onOpenTrashView={onOpenTrashView}
        onSelectRightPanel={onSelectRightPanel}
        onToggleListVisibility={props.onToggleListVisibility}
        onToggleRightSidebarVisibility={props.onToggleRightSidebarVisibility}
        rightSidebarWidth={props.rightSidebarWidth}
      />
      <WorkspaceLayoutGrid
        activeRightPanelId={activeRightPanelId}
        documentNodeId={documentNodeId}
        isImportManagementOpen={isImportManagementOpen}
        onOpenImportManagement={onOpenImportManagement}
        onSelectNode={onSelectNode}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
        props={props}
      />
    </>
  );
}
