import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { usePdfTopBars } from '../../features/pdf/components/PdfTopBarsContext';
import { ReviewCalendarDialog } from '../../features/review/components/ReviewCalendarDialog';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { selectImmersiveReadingModeSource } from './immersiveReadingModeSource';
import { ImmersiveShortcutsOverlay } from './ImmersiveShortcutsOverlay';
import { ImportSourceWorkspace } from './ImportSourceWorkspace';
import { useImmersiveReadingMode } from './useImmersiveReadingMode';
import { useWorkspaceActivityNotice } from './useWorkspaceActivityNotice';
import { useWorkspaceImportRequests } from './useWorkspaceImportRequests';
import { useWorkspaceShellBridges } from './useWorkspaceShellBridges';
import { WorkspaceActivityNotice } from './WorkspaceActivityNotice';
import { WorkspaceLayoutGrid, type WorkspaceLayoutGridSource } from './WorkspaceLayoutGrid';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceMainTitleBar, type WorkspaceTitleBarSource } from './WorkspaceMainTitleBar';
import { PdfWindowChrome, WorkspacePdfTopBars } from './WorkspacePdfTopBars';
import { WorkspacePublishDialogHosts } from './WorkspacePublishDialogHosts';
import {
  loadWorkspaceRightPanelPreference,
  saveWorkspaceRightPanelPreference
} from './workspaceRightPanelPreference';
import { subscribeWorkspaceRightPanelRequests } from './workspaceRightPanelRequests';
import { WorkspaceRuntimeNotice } from './WorkspaceRuntimeNotice';
import { selectWorkspaceSettingsOverlayProps, WorkspaceSettingsOverlay } from './WorkspaceSettingsOverlay';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

interface WorkspaceSurfaceActionsSource {
  onCloseImportManagement: () => void;
  onOpenTrashView: () => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
}

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
  const leftUndocked = layoutChrome.isListCollapsed || layoutChrome.compactSidebars?.leftFloating;
  const rightUndocked = layoutChrome.isRightSidebarCollapsed || layoutChrome.compactSidebars?.rightFloating;
  return {
    '--workspace-list-width': `${layoutChrome.listWidth}px`,
    '--workspace-list-folder-current-width': leftUndocked
      ? '0px'
      : 'min(var(--workspace-folder-column-width), var(--workspace-list-width))',
    '--workspace-list-current-width': leftUndocked ? '0px' : `${layoutChrome.listWidth}px`,
    '--workspace-list-splitter-width': leftUndocked ? '0px' : '1px',
    '--workspace-right-sidebar-current-width': rightUndocked ? '0px' : `${layoutChrome.rightSidebarWidth}px`,
    '--workspace-right-sidebar-splitter-width': rightUndocked ? '0px' : '1px',
    '--workspace-right-sidebar-width': `${layoutChrome.rightSidebarWidth}px`
  } as CSSProperties;
}

function renderWorkspaceActivityNotice(controller: ReturnType<typeof useWorkspaceActivityNotice>) {
  if (!controller.notice) {
    return null;
  }
  return (
    <WorkspaceActivityNotice
      message={controller.notice.message}
      tone={controller.notice.tone}
      {...definedProps({ onOpen: controller.notice.nodeId ? controller.openImportedTopic : undefined })}
    />
  );
}

function useWorkspaceImportNoticeController(imports: WorkspaceLayoutProps['imports'], navigation: WorkspaceLayoutProps['navigation']) {
  const handleOpenClipboardImport = useCallback((nodeId: string) => {
    imports.onCloseImportManagement();
    navigation.onSelectNode(nodeId);
  }, [imports.onCloseImportManagement, navigation.onSelectNode]);
  const clipboardImportNotice = useWorkspaceActivityNotice(
    imports.onStartClipboardImport,
    imports.onRunImportFile,
    handleOpenClipboardImport
  );
  useWorkspaceImportRequests(clipboardImportNotice);
  return clipboardImportNotice;
}

export function WorkspaceLayoutMain(props: WorkspaceLayoutProps) {
  return <WorkspacePdfTopBars isImmersiveMode={props.layoutChrome.isImmersiveMode}>
    <WorkspaceMainContent {...props} />
  </WorkspacePdfTopBars>;
}

function useWorkspaceRightPanel(layoutChrome: WorkspaceLayoutProps['layoutChrome']) {
  const [activeRightPanelId, setActiveRightPanelId] = useState<WorkspaceRightPanelId>(() =>
    loadWorkspaceRightPanelPreference()
  );
  useEffect(() => {
    saveWorkspaceRightPanelPreference(activeRightPanelId);
  }, [activeRightPanelId]);

  const handleSelectRightPanel = useCallback((panelId: WorkspaceRightPanelId) => {
    setActiveRightPanelId(panelId);
    if (layoutChrome.isRightSidebarCollapsed) {
      layoutChrome.onToggleRightSidebarVisibility();
    }
  }, [layoutChrome.isRightSidebarCollapsed, layoutChrome.onToggleRightSidebarVisibility]);

  useEffect(() => subscribeWorkspaceRightPanelRequests(handleSelectRightPanel), [handleSelectRightPanel]);

  return { activeRightPanelId, handleSelectRightPanel };
}

function WorkspaceMainContent(props: WorkspaceLayoutProps) {
  const t = useTranslation();
  const { imports, layoutChrome, navigation, settings, trash } = props;
  const pdfTopBars = usePdfTopBars();
  useWorkspaceShellBridges();
  const { activeRightPanelId, handleSelectRightPanel } = useWorkspaceRightPanel(layoutChrome);
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

  return (
    <main data-pdf-top-bars-floating={pdfTopBars.floating} data-pdf-top-bars-visible={pdfTopBars.visible} data-pdf-sidebar-hover={layoutChrome.compactSidebars?.hoverEnabled} aria-label={t('desktop.workspace.main')} data-floating-sidebar={layoutChrome.compactSidebars?.openSide ?? undefined} className="workspace-responsive-shell relative flex h-dvh flex-col overflow-hidden p-0" style={buildWorkspaceGridStyle(layoutChrome)}>
      <PdfWindowChrome isImmersiveMode={layoutChrome.isImmersiveMode} sidebarHoverEnabled={Boolean(layoutChrome.compactSidebars?.hoverEnabled)} leftSidebarVisible={!layoutChrome.isListCollapsed} />
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
      {props.overlay}
      {renderWorkspaceActivityNotice(clipboardImportNotice)}
      <WorkspaceRuntimeNotice />
      <WorkspaceAuxiliaryDialogs />
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
  props: WorkspaceLayoutGridSource;
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
  gridProps: WorkspaceLayoutGridSource;
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

function WorkspaceAuxiliaryDialogs() {
  return <>
    <WorkspacePublishDialogHosts />
    <ReviewCalendarDialog />
  </>;
}
