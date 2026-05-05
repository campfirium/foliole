import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { getFormalImportFailureMessage } from '../hooks/useFormalImport';

import { ClipboardImportNotice, type ClipboardImportNoticeTone } from './ClipboardImportNotice';
import { ImmersiveShortcutsOverlay } from './ImmersiveShortcutsOverlay';
import { ImportSourceWorkspace } from './ImportSourceWorkspace';
import { useImmersiveReadingMode } from './useImmersiveReadingMode';
import { WorkspaceLayoutGrid, type WorkspaceLayoutGridSource } from './WorkspaceLayoutGrid';
import { flattenWorkspaceLayoutProps, type WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceMainTitleBar, type WorkspaceTitleBarSource } from './WorkspaceMainTitleBar';
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

type WorkspaceGridRenderSource = WorkspaceLayoutGridSource;

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

function buildWorkspaceGridStyle(layoutChrome: WorkspaceLayoutProps['layoutChrome']) {
  return {
    '--workspace-list-width': `${layoutChrome.listWidth}px`,
    '--workspace-list-folder-current-width': layoutChrome.isListCollapsed
      ? '0px'
      : 'min(var(--workspace-folder-column-width), var(--workspace-list-width))',
    '--workspace-list-current-width': layoutChrome.isListCollapsed ? '0px' : `${layoutChrome.listWidth}px`,
    '--workspace-list-splitter-width': layoutChrome.isListCollapsed ? '0px' : '1px',
    '--workspace-right-sidebar-current-width': layoutChrome.isRightSidebarCollapsed ? '0px' : `${layoutChrome.rightSidebarWidth}px`,
    '--workspace-right-sidebar-splitter-width': layoutChrome.isRightSidebarCollapsed ? '0px' : '1px',
    '--workspace-right-sidebar-width': `${layoutChrome.rightSidebarWidth}px`
  } as CSSProperties;
}

export function WorkspaceLayoutMain(props: WorkspaceLayoutProps) {
  const flatProps = useMemo(() => flattenWorkspaceLayoutProps(props), [props]);
  const { imports, layoutChrome, navigation, nodeList, settings, trash } = props;
  const [activeRightPanelId, setActiveRightPanelId] = useState<WorkspaceRightPanelId>(() =>
    loadWorkspaceRightPanelPreference()
  );
  const immersive = useImmersiveReadingMode(flatProps);
  const clipboardImportNotice = useClipboardImportNotice(imports.onStartClipboardImport);
  const { handleOpenNotesView, handleOpenTrashView, handleSelectNode } = useWorkspaceSurfaceActions({
    onCloseImportManagement: imports.onCloseImportManagement,
    onOpenNotesView: nodeList.onOpenNotesView,
    onOpenTrashView: trash.onOpenTrashView,
    onSelectNode: navigation.onSelectNode
  });
  const workspaceGridStyle = buildWorkspaceGridStyle(layoutChrome);
  const documentNodeId = trash.isViewingTrashNode ? trash.selectedTrashNodeId : navigation.activeNodeId;

  useEffect(() => {
    saveWorkspaceRightPanelPreference(activeRightPanelId);
  }, [activeRightPanelId]);

  const handleSelectRightPanel = useCallback((panelId: WorkspaceRightPanelId) => {
    setActiveRightPanelId(panelId);
    if (layoutChrome.isRightSidebarCollapsed) {
      layoutChrome.onToggleRightSidebarVisibility();
    }
  }, [layoutChrome.isRightSidebarCollapsed, layoutChrome.onToggleRightSidebarVisibility]);

  return (
    <main aria-label="Foliole workspace" className="relative flex h-dvh flex-col overflow-hidden p-0" style={workspaceGridStyle}>
      <WorkspaceMainChrome
        activeRightPanelId={activeRightPanelId}
        onOpenNotesView={handleOpenNotesView}
        onOpenTrashView={handleOpenTrashView}
        isImportManagementOpen={imports.isImportManagementOpen}
        onSelectRightPanel={handleSelectRightPanel}
        documentNodeId={documentNodeId}
        onOpenImportManagement={imports.onOpenImportManagement}
        onStartClipboardImport={clipboardImportNotice.startClipboardImport}
        onStartImport={() => void imports.onRunImportFile()}
        onSelectNode={handleSelectNode}
        immersive={immersive}
        gridProps={props}
        titleBarProps={props}
      />
      {clipboardImportNotice.notice ? <ClipboardImportNotice message={clipboardImportNotice.notice.message} tone={clipboardImportNotice.notice.tone} /> : null}
      <ImmersiveShortcutsOverlay visible={layoutChrome.isImmersiveMode && !immersive.isImmersiveEditing && immersive.isShortcutsOverlayOpen} />
      <ImportSourceWorkspace
        onOpenChange={(open) => (open ? imports.onOpenImportManagement() : imports.onCloseImportManagement())}
        onSelectNode={handleSelectNode}
        open={imports.isImportManagementOpen}
      />
      <WorkspaceSettingsOverlay {...selectWorkspaceSettingsOverlayProps(settings)} />
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
    args.immersive.shouldSuppressSelectionRestore() || args.props.navigation.shouldSuppressNavigationSelectionRestore();

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
