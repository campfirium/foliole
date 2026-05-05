import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { getFormalImportFailureMessage } from '../hooks/useFormalImport';

import { ClipboardImportNotice, type ClipboardImportNoticeTone } from './ClipboardImportNotice';
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

function resolveExternalTitleBarTitle(props: WorkspaceLayoutProps) {
  const selection = props.externalSelection;
  if (!props.isExternalViewOpen || selection.kind !== 'document') {
    return null;
  }
  const entries = props.externalEntriesByFolderId[selection.folderId] ?? [];
  const entry = entries.find((candidate) => candidate.absolutePath === selection.absolutePath);
  return entry?.title.trim() || entry?.fileName.trim() || selection.absolutePath.split(/[\\/]/).at(-1) || 'External document';
}

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

function useClipboardImportNotice(onStartClipboardImport: WorkspaceLayoutProps['onStartClipboardImport']) {
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
  const [activeRightPanelId, setActiveRightPanelId] = useState<WorkspaceRightPanelId>(() =>
    loadWorkspaceRightPanelPreference()
  );
  const immersive = useImmersiveReadingMode(props);
  const clipboardImportNotice = useClipboardImportNotice(props.onStartClipboardImport);
  const { handleOpenNotesView, handleOpenTrashView, handleSelectNode } = useWorkspaceSurfaceActions(props);
  const workspaceGridStyle = {
    '--workspace-list-width': `${props.listWidth}px`,
    '--workspace-list-folder-current-width': props.isListCollapsed
      ? '0px'
      : 'min(var(--workspace-folder-column-width), var(--workspace-list-width))',
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
        onOpenTrashView={handleOpenTrashView}
        isImportManagementOpen={props.isImportManagementOpen}
        onSelectRightPanel={handleSelectRightPanel}
        documentNodeId={documentNodeId}
        onOpenImportManagement={props.onOpenImportManagement}
        onStartClipboardImport={clipboardImportNotice.startClipboardImport}
        onStartImport={() => void props.onRunImportFile()}
        onSelectNode={handleSelectNode}
        immersive={immersive}
        props={props}
      />
      {clipboardImportNotice.notice ? <ClipboardImportNotice message={clipboardImportNotice.notice.message} tone={clipboardImportNotice.notice.tone} /> : null}
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

function renderWorkspaceTitleBar(args: {
  activeRightPanelId: WorkspaceRightPanelId;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  props: WorkspaceLayoutProps;
}) {
  if (args.props.isImmersiveMode) {
    return null;
  }
  const externalTitle = resolveExternalTitleBarTitle(args.props);
  return (
    <WindowTitleBar
      activeRightPanelId={args.activeRightPanelId}
      centerTitle={externalTitle ?? resolveWindowTitleBarTitle(
        args.props.isViewingTrashNode ? args.props.selectedTrashNodeId : args.props.activeNodeId,
        args.props.nodesById
      )}
      centerTitleIcon={externalTitle ? 'external' : undefined}
      isListCollapsed={args.props.isListCollapsed}
      isRightSidebarCollapsed={args.props.isRightSidebarCollapsed}
      isTrashViewOpen={args.props.isTrashViewOpen}
      listWidth={args.props.listWidth}
      onOpenNotesView={args.onOpenNotesView}
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
      {renderWorkspaceTitleBar({
        activeRightPanelId,
        onOpenNotesView,
        onOpenTrashView,
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
