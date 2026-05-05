import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { getFormalImportFailureMessage } from '../hooks/useFormalImport';

import { ClipboardImportNotice, type ClipboardImportNoticeTone } from './ClipboardImportNotice';
import { ImmersiveShortcutsOverlay } from './ImmersiveShortcutsOverlay';
import { ImportSourceWorkspace } from './ImportSourceWorkspace';
import { useImmersiveReadingMode } from './useImmersiveReadingMode';
import { WorkspaceLayoutGrid, type WorkspaceLayoutGridSource } from './WorkspaceLayoutGrid';
import { WorkspaceMainTitleBar, type WorkspaceTitleBarSource } from './WorkspaceMainTitleBar';
import { flattenWorkspaceLayoutProps, type WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import {
  loadWorkspaceRightPanelPreference,
  saveWorkspaceRightPanelPreference
} from './workspaceRightPanelPreference';
import {
  selectWorkspaceSettingsOverlayProps,
  WorkspaceSettingsOverlay
} from './WorkspaceSettingsOverlay';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

interface WorkspaceSurfaceActionsSource {
  onCloseImportManagement: () => void;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
}

type WorkspaceGridRenderSource = WorkspaceLayoutGridSource & {
  shouldSuppressNavigationSelectionRestore: () => boolean;
};

function useWorkspaceSurfaceActions(props: WorkspaceSurfaceActionsSource) {
  const handleOpenNotesView = useCallback(() => {
    props.onCloseImportManagement();
    props.onOpenNotesView();
  }, [props.onCloseImportManagement, props.onOpenNotesView]);
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
    handleOpenTrashView,
    handleSelectNode
  };
}

function useClipboardImportNotice(onStartClipboardImport: () => boolean | Promise<boolean>) {
  const [notice, setNotice] = useState<{ id: number; message: string; tone: ClipboardImportNoticeTone } | null>(null);

  useEffect(() => {
    if (!notice || notice.tone === 'loading') {
      return;
    }
    const timeout = window.setTimeout(() => setNotice((current) => (current?.id === notice.id ? null : current)), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const startClipboardImport = useCallback(async () => {
    const id = Date.now();
    setNotice({ id, message: 'Importing clipboard...', tone: 'loading' });
    const imported = await onStartClipboardImport();
    const failureMessage = imported ? null : getFormalImportFailureMessage();
    setNotice({
      id,
      message: imported ? 'Clipboard imported to Inbox' : (failureMessage ?? 'No supported clipboard content found'),
      tone: imported ? 'success' : 'error'
    });
  }, [onStartClipboardImport]);

  return { notice, startClipboardImport };
}

export function WorkspaceLayoutMain(props: WorkspaceLayoutProps) {
  const flatProps = useMemo(() => flattenWorkspaceLayoutProps(props), [props]);
  const [activeRightPanelId, setActiveRightPanelId] = useState<WorkspaceRightPanelId>(() =>
    loadWorkspaceRightPanelPreference()
  );
  const immersive = useImmersiveReadingMode(flatProps);
  const clipboardImportNotice = useClipboardImportNotice(flatProps.onStartClipboardImport);
  const { handleOpenNotesView, handleOpenTrashView, handleSelectNode } = useWorkspaceSurfaceActions(flatProps);
  const workspaceGridStyle = {
    '--workspace-list-width': `${flatProps.listWidth}px`,
    '--workspace-list-folder-current-width': flatProps.isListCollapsed
      ? '0px'
      : 'min(var(--workspace-folder-column-width), var(--workspace-list-width))',
    '--workspace-list-current-width': flatProps.isListCollapsed ? '0px' : `${flatProps.listWidth}px`,
    '--workspace-list-splitter-width': flatProps.isListCollapsed ? '0px' : '1px',
    '--workspace-right-sidebar-current-width': flatProps.isRightSidebarCollapsed ? '0px' : `${flatProps.rightSidebarWidth}px`,
    '--workspace-right-sidebar-splitter-width': flatProps.isRightSidebarCollapsed ? '0px' : '1px',
    '--workspace-right-sidebar-width': `${flatProps.rightSidebarWidth}px`
  } as CSSProperties;
  const documentNodeId = flatProps.isViewingTrashNode ? flatProps.selectedTrashNodeId : flatProps.activeNodeId;

  useEffect(() => {
    saveWorkspaceRightPanelPreference(activeRightPanelId);
  }, [activeRightPanelId]);

  const handleSelectRightPanel = useCallback((panelId: WorkspaceRightPanelId) => {
    setActiveRightPanelId(panelId);
    if (flatProps.isRightSidebarCollapsed) {
      flatProps.onToggleRightSidebarVisibility();
    }
  }, [flatProps.isRightSidebarCollapsed, flatProps.onToggleRightSidebarVisibility]);

  return (
    <main aria-label="Foliole workspace" className="relative flex h-dvh flex-col overflow-hidden p-0" style={workspaceGridStyle}>
      <WorkspaceMainChrome
        activeRightPanelId={activeRightPanelId}
        onOpenNotesView={handleOpenNotesView}
        onOpenTrashView={handleOpenTrashView}
        isImportManagementOpen={flatProps.isImportManagementOpen}
        onSelectRightPanel={handleSelectRightPanel}
        documentNodeId={documentNodeId}
        onOpenImportManagement={flatProps.onOpenImportManagement}
        onStartClipboardImport={clipboardImportNotice.startClipboardImport}
        onStartImport={() => void flatProps.onRunImportFile()}
        onSelectNode={handleSelectNode}
        immersive={immersive}
        gridProps={flatProps}
        titleBarProps={props}
      />
      {clipboardImportNotice.notice ? <ClipboardImportNotice message={clipboardImportNotice.notice.message} tone={clipboardImportNotice.notice.tone} /> : null}
      <ImmersiveShortcutsOverlay visible={flatProps.isImmersiveMode && !immersive.isImmersiveEditing && immersive.isShortcutsOverlayOpen} />
      <ImportSourceWorkspace
        onOpenChange={(open) => (open ? flatProps.onOpenImportManagement() : flatProps.onCloseImportManagement())}
        onSelectNode={handleSelectNode}
        open={flatProps.isImportManagementOpen}
      />
      <WorkspaceSettingsOverlay {...selectWorkspaceSettingsOverlayProps(flatProps)} />
    </main>
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
  props: WorkspaceGridRenderSource;
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
  onOpenTrashView,
  onSelectNode,
  onSelectRightPanel,
  onStartClipboardImport,
  onStartImport,
  immersive,
  gridProps,
  titleBarProps
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImportManagementOpen: boolean;
  onOpenImportManagement: () => void;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  gridProps: WorkspaceGridRenderSource;
  titleBarProps: WorkspaceTitleBarSource;
  immersive: ReturnType<typeof useImmersiveReadingMode>;
}) {
  return (
    <>
      <WorkspaceMainTitleBar
        activeRightPanelId={activeRightPanelId}
        onOpenNotesView={onOpenNotesView}
        onOpenTrashView={onOpenTrashView}
        onSelectRightPanel={onSelectRightPanel}
        props={titleBarProps}
      />
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
        props: gridProps
      })}
    </>
  );
}
