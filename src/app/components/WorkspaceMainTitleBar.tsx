import type { Node } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import type { ExternalLibraryBrowseEntry } from '../../shared/platform/externalLibraryBrowseRepository';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { WindowTitleBar } from './WindowTitleBar';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export type WorkspaceTitleBarSource = Pick<
  WorkspaceLayoutProps,
  'externalLibrary' | 'layoutChrome' | 'navigation' | 'nodeList' | 'review' | 'trash'
>;

function resolveExternalTitleBarTitle(props: {
  externalEntriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
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

function resolveWindowTitleBarTitle(nodeId: string | null, nodesById: Record<string, Node>, t: Translate) {
  if (!nodeId) {
    return null;
  }

  let cursor = nodesById[nodeId];
  if (!cursor) {
    return null;
  }
  if (cursor.kind === 'folder') {
    return cursor.title.trim() || t('desktop.search.context.untitled');
  }

  while (cursor?.parentNodeId) {
    const parent: Node | undefined = nodesById[cursor.parentNodeId];
    if (!parent || parent.kind === 'folder') {
      break;
    }
    cursor = parent;
  }

  return cursor?.title.trim() || t('desktop.search.context.untitled');
}

function resolveReviewTitleBarTitle(review: WorkspaceLayoutProps['review']) {
  return review.isStudyMode && review.reviewStatus === 'completed' ? 'Queue clear' : null;
}

export function WorkspaceMainTitleBar({
  activeRightPanelId,
  onOpenTrashView,
  onSelectRightPanel,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  onOpenTrashView: () => void;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  props: WorkspaceTitleBarSource;
}) {
  const t = useTranslation();
  const { externalLibrary, layoutChrome, navigation, nodeList, review, trash } = props;
  if (layoutChrome.isImmersiveMode) {
    return null;
  }
  const externalTitle = resolveExternalTitleBarTitle(externalLibrary);
  return (
    <WindowTitleBar
      activeRightPanelId={activeRightPanelId}
      centerTitle={externalTitle ?? resolveReviewTitleBarTitle(review) ?? resolveWindowTitleBarTitle(
        trash.isViewingTrashNode ? trash.selectedTrashNodeId : navigation.activeNodeId,
        nodeList.nodesById,
        t
      )}
      isListCollapsed={layoutChrome.isListCollapsed}
      isRightSidebarCollapsed={layoutChrome.isRightSidebarCollapsed}
      isTrashViewOpen={trash.isTrashViewOpen}
      listWidth={layoutChrome.listWidth}
      onOpenTrashView={onOpenTrashView}
      onSelectRightPanel={onSelectRightPanel}
      onToggleListVisibility={layoutChrome.onToggleListVisibility}
      onToggleRightSidebarVisibility={layoutChrome.onToggleRightSidebarVisibility}
      rightSidebarWidth={layoutChrome.rightSidebarWidth}
      {...definedProps({ centerTitleIcon: externalTitle ? ('external' as const) : undefined })}
    />
  );
}
