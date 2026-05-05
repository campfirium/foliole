import type { Node } from '../../features/nodes/model/nodeTypes';
import type { RuntimeExternalSearchBrowseEntry } from '../../shared/platform/externalSearchBridge';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { WindowTitleBar } from './WindowTitleBar';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export interface WorkspaceTitleBarSource {
  activeNodeId: string | null;
  externalEntriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>;
  externalSelection: ExternalLibrarySelection;
  isExternalViewOpen: boolean;
  isImmersiveMode: boolean;
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  isTrashViewOpen: boolean;
  isViewingTrashNode: boolean;
  listWidth: number;
  nodesById: Record<string, Node>;
  onToggleListVisibility: () => void;
  onToggleRightSidebarVisibility: () => void;
  rightSidebarWidth: number;
  selectedTrashNodeId: string | null;
}

function resolveExternalTitleBarTitle(props: {
  externalEntriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>;
  externalSelection: ExternalLibrarySelection;
  isExternalViewOpen: boolean;
}) {
  const selection = props.externalSelection;
  if (!props.isExternalViewOpen || selection.kind !== 'document') {
    return null;
  }
  const entries = props.externalEntriesByFolderId[selection.folderId] ?? [];
  const entry = entries.find((candidate) => candidate.absolutePath === selection.absolutePath);
  return entry?.title.trim() || entry?.fileName.trim() || selection.absolutePath.split(/[\\/]/).at(-1) || 'External document';
}

function resolveWindowTitleBarTitle(nodeId: string | null, nodesById: Record<string, Node>) {
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

export function WorkspaceMainTitleBar({
  activeRightPanelId,
  onOpenNotesView,
  onOpenTrashView,
  onSelectRightPanel,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  props: WorkspaceTitleBarSource;
}) {
  if (props.isImmersiveMode) {
    return null;
  }
  const externalTitle = resolveExternalTitleBarTitle(props);
  return (
    <WindowTitleBar
      activeRightPanelId={activeRightPanelId}
      centerTitle={externalTitle ?? resolveWindowTitleBarTitle(
        props.isViewingTrashNode ? props.selectedTrashNodeId : props.activeNodeId,
        props.nodesById
      )}
      centerTitleIcon={externalTitle ? 'external' : undefined}
      isListCollapsed={props.isListCollapsed}
      isRightSidebarCollapsed={props.isRightSidebarCollapsed}
      isTrashViewOpen={props.isTrashViewOpen}
      listWidth={props.listWidth}
      onOpenNotesView={onOpenNotesView}
      onOpenTrashView={onOpenTrashView}
      onSelectRightPanel={onSelectRightPanel}
      onToggleListVisibility={props.onToggleListVisibility}
      onToggleRightSidebarVisibility={props.onToggleRightSidebarVisibility}
      rightSidebarWidth={props.rightSidebarWidth}
    />
  );
}
