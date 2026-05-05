import type { Node } from '../../features/nodes/model/nodeTypes';
import type { RuntimeExternalSearchBrowseEntry } from '../../shared/platform/externalSearchRuntimeRepository';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WindowTitleBar } from './WindowTitleBar';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export type WorkspaceTitleBarSource = Pick<
  WorkspaceLayoutProps,
  'externalLibrary' | 'layoutChrome' | 'navigation' | 'nodeList' | 'trash'
>;

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
  const { externalLibrary, layoutChrome, navigation, nodeList, trash } = props;
  if (layoutChrome.isImmersiveMode) {
    return null;
  }
  const externalTitle = resolveExternalTitleBarTitle(externalLibrary);
  return (
    <WindowTitleBar
      activeRightPanelId={activeRightPanelId}
      centerTitle={externalTitle ?? resolveWindowTitleBarTitle(
        trash.isViewingTrashNode ? trash.selectedTrashNodeId : navigation.activeNodeId,
        nodeList.nodesById
      )}
      centerTitleIcon={externalTitle ? 'external' : undefined}
      isListCollapsed={layoutChrome.isListCollapsed}
      isRightSidebarCollapsed={layoutChrome.isRightSidebarCollapsed}
      isTrashViewOpen={trash.isTrashViewOpen}
      listWidth={layoutChrome.listWidth}
      onOpenNotesView={onOpenNotesView}
      onOpenTrashView={onOpenTrashView}
      onSelectRightPanel={onSelectRightPanel}
      onToggleListVisibility={layoutChrome.onToggleListVisibility}
      onToggleRightSidebarVisibility={layoutChrome.onToggleRightSidebarVisibility}
      rightSidebarWidth={layoutChrome.rightSidebarWidth}
    />
  );
}
