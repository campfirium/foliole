import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';

import { ClipboardImportNotice } from './ClipboardImportNotice';
import { CLIPBOARD_IMPORT_REQUEST_EVENT } from './clipboardImportRequest';
import { selectImmersiveReadingModeSource } from './immersiveReadingModeSource';
import { ImmersiveShortcutsOverlay } from './ImmersiveShortcutsOverlay';
import { ImportSourceWorkspace } from './ImportSourceWorkspace';
import { useClipboardImportNotice } from './useClipboardImportNotice';
import { useImmersiveReadingMode } from './useImmersiveReadingMode';
import { WorkspaceLayoutGrid, type WorkspaceLayoutGridSource } from './WorkspaceLayoutGrid';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceMainTitleBar, type WorkspaceTitleBarSource } from './WorkspaceMainTitleBar';
import {
  loadWorkspaceRightPanelPreference,
  saveWorkspaceRightPanelPreference
} from './workspaceRightPanelPreference';
import { WorkspaceRuntimeNotice } from './WorkspaceRuntimeNotice';
import {
  selectWorkspaceSettingsOverlayProps,
  WorkspaceSettingsOverlay
} from './WorkspaceSettingsOverlay';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

interface WorkspaceSurfaceActionsSource {
  onCloseImportManagement: () => void;
  onOpenTrashView: () => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
}

type WorkspaceGridRenderSource = WorkspaceLayoutGridSource;

function useWorkspaceSurfaceActions(props: WorkspaceSurfaceActionsSource) {
  const handleOpenTrashView = useCallback(() => {
    props.onCloseImportManagement();
    props.onOpenTrashView();
  }, [props.onCloseImportManagement, props.onOpenTrashView]);
  const handleSelectNode = useCallback((nodeId: string, focusAnchor?: NodeAnchorLink | null) => {
    props.onCloseImportManagement();
    props.onSelectNode(nodeId, focusAnchor);
  }, [props.onCloseImportManagement, props.onSelectNode]);
  return {
    handleOpenTrashView,
    handleSelectNode
  };
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

function renderClipboardImportNotice(controller: ReturnType<typeof useClipboardImportNotice>) {
  if (!controller.notice) {
    return null;
  }
  return (
    <ClipboardImportNotice
      message={controller.notice.message}
      tone={controller.notice.tone}
      {...definedProps({ onOpen: controller.notice.nodeId ? controller.openImportedTopic : undefined })}
    />
  );
}

function useClipboardImportRequest(controller: ReturnType<typeof useClipboardImportNotice>) {
  useEffect(() => {
    const handleRequest = () => {
      void controller.startClipboardImport();
    };
    window.addEventListener(CLIPBOARD_IMPORT_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(CLIPBOARD_IMPORT_REQUEST_EVENT, handleRequest);
  }, [controller.startClipboardImport]);
}

function useWorkspaceImportNoticeController(imports: WorkspaceLayoutProps['imports'], navigation: WorkspaceLayoutProps['navigation']) {
  const handleOpenClipboardImport = useCallback((nodeId: string) => {
    imports.onCloseImportManagement();
    navigation.onSelectNode(nodeId);
  }, [imports.onCloseImportManagement, navigation.onSelectNode]);
  const clipboardImportNotice = useClipboardImportNotice(
    imports.onStartClipboardImport,
    imports.onRunImportFile,
    handleOpenClipboardImport
  );
  useClipboardImportRequest(clipboardImportNotice);
  return clipboardImportNotice;
}

export function WorkspaceLayoutMain(props: WorkspaceLayoutProps) {
  const { imports, layoutChrome, navigation, settings, trash } = props;
  const [activeRightPanelId, setActiveRightPanelId] = useState<WorkspaceRightPanelId>(() =>
    loadWorkspaceRightPanelPreference()
  );
  const immersiveSource = useMemo(() => selectImmersiveReadingModeSource(props), [props]);
  const immersive = useImmersiveReadingMode(immersiveSource);
  const clipboardImportNotice = useWorkspaceImportNoticeController(imports, navigation);
  const gridProps = useMemo(() => ({
    ...props,
    imports: {
      ...imports,
      onRunImportFile: clipboardImportNotice.startFileImport,
      onStartClipboardImport: clipboardImportNotice.startClipboardImport
    }
  }), [clipboardImportNotice.startClipboardImport, clipboardImportNotice.startFileImport, imports, props]);
  const { handleOpenTrashView, handleSelectNode } = useWorkspaceSurfaceActions({
    onCloseImportManagement: imports.onCloseImportManagement,
    onOpenTrashView: trash.onOpenTrashView,
    onSelectNode: navigation.onSelectNode
  });
  const workspaceGridStyle = buildWorkspaceGridStyle(layoutChrome);

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
    <main aria-label="Foliole workspace" className="workspace-responsive-shell relative flex h-dvh flex-col overflow-hidden p-0" style={workspaceGridStyle}>
      <WorkspaceMainChrome
        activeRightPanelId={activeRightPanelId}
        onOpenTrashView={handleOpenTrashView}
        onSelectRightPanel={handleSelectRightPanel}
        documentNodeId={trash.isViewingTrashNode ? trash.selectedTrashNodeId : navigation.activeNodeId}
        onSelectNode={handleSelectNode}
        immersive={immersive}
        gridProps={gridProps}
        titleBarProps={props}
      />
      {renderClipboardImportNotice(clipboardImportNotice)}
      <WorkspaceRuntimeNotice />
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
  onEnterImmersiveEdit: () => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  props: WorkspaceGridRenderSource;
}) {
  const shouldSuppressSelectionRestore = () =>
    args.immersive.shouldSuppressSelectionRestore() || args.props.navigation.shouldSuppressNavigationSelectionRestore();

  return (
    <WorkspaceLayoutGrid
      activeRightPanelId={args.activeRightPanelId}
      documentNodeId={args.documentNodeId}
      isImmersiveEditing={args.immersive.isImmersiveEditing}
      onEnterImmersiveEdit={args.onEnterImmersiveEdit}
      onSelectNode={args.onSelectNode}
      onShouldSuppressSelectionRestore={shouldSuppressSelectionRestore}
      props={args.props}
    />
  );
}

function WorkspaceMainChrome({
  activeRightPanelId,
  documentNodeId,
  onOpenTrashView,
  onSelectNode,
  onSelectRightPanel,
  immersive,
  gridProps,
  titleBarProps
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  onOpenTrashView: () => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  gridProps: WorkspaceGridRenderSource;
  titleBarProps: WorkspaceTitleBarSource;
  immersive: ReturnType<typeof useImmersiveReadingMode>;
}) {
  return (
    <>
      <WorkspaceMainTitleBar
        activeRightPanelId={activeRightPanelId}
        onOpenTrashView={onOpenTrashView}
        onSelectRightPanel={onSelectRightPanel}
        props={titleBarProps}
      />
      {renderWorkspaceGrid({
        activeRightPanelId,
        documentNodeId,
        immersive,
        onEnterImmersiveEdit: immersive.enterImmersiveEdit,
        onSelectNode,
        props: gridProps
      })}
    </>
  );
}
