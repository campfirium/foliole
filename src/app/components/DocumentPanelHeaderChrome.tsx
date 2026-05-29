import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode, isVirtualRootNode } from '../../features/nodes/model/specialNodes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';

import { DocumentPanelHeader } from './DocumentPanelHeader';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';

const TRASH_HEADER_NODE_ID = 'trash-preview-root';
const TRASH_HEADER_ACTIVE_NODE_ID = 'trash-preview-active';

function createTrashHeaderNode(id: string, parentNodeId: string | null, title: string, kind: Node['kind']): Node {
  return {
    content: '',
    createdAt: '',
    id,
    kind,
    parentNodeId,
    reading: null,
    reveal: null,
    review: null,
    title,
    updatedAt: ''
  };
}

function resolveDocumentHeaderBreadcrumb(props: DocumentPanelSectionProps) {
  const isTrashDocument = Boolean(
    props.isTrashViewOpen && props.activeNodeId && props.trashedNodeIds.includes(props.activeNodeId)
  );
  if (!isTrashDocument) {
    return {
      activeNodeId: props.activeNodeId,
      nodesById: props.nodesById,
      onSelectBreadcrumbNode: props.onSelectBreadcrumbNode
    };
  }
  return {
    activeNodeId: TRASH_HEADER_ACTIVE_NODE_ID,
    nodesById: {
      [TRASH_HEADER_NODE_ID]: createTrashHeaderNode(TRASH_HEADER_NODE_ID, null, 'Trash', 'folder'),
      [TRASH_HEADER_ACTIVE_NODE_ID]: createTrashHeaderNode(TRASH_HEADER_ACTIVE_NODE_ID, TRASH_HEADER_NODE_ID, '', 'topic')
    },
    onSelectBreadcrumbNode: () => undefined
  };
}

export function renderDocumentPanelHeader(args: {
  backlinks: BacklinkItem[];
  folderListSortDirection: FolderListSortDirection;
  folderListSortKey: FolderListSortKey;
  isFolderListView: boolean;
  isSourceUpdatePanelOpen: boolean;
  onChangeSortDirection: (value: FolderListSortDirection) => void;
  onChangeSortKey: (value: FolderListSortKey) => void;
  onToggleSourceUpdatePanel: () => void;
  props: DocumentPanelSectionProps;
  showSourceUpdateAction: boolean;
}) {
  const breadcrumb = resolveDocumentHeaderBreadcrumb(args.props);
  const activeNode = args.props.activeNodeId ? args.props.nodesById[args.props.activeNodeId] : undefined;
  if (args.isFolderListView || isVirtualNode(activeNode) || isVirtualRootNode(activeNode)) {
    return null;
  }

  return (
    <DocumentPanelHeader
      activeNodeId={breadcrumb.activeNodeId}
      backlinks={args.backlinks}
      canGoBack={args.props.canGoBack}
      canGoForward={args.props.canGoForward}
      canGoParent={args.props.canGoParent}
      editableNodeId={args.props.editableNodeId}
      folderListToolbar={null}
      isFolderListView={args.isFolderListView}
      isSourceUpdatePanelOpen={args.isSourceUpdatePanelOpen}
      nodesById={breadcrumb.nodesById}
      onGoBack={args.props.onGoBack}
      onGoForward={args.props.onGoForward}
      onGoParent={args.props.onGoParent}
      onNodePriorityChange={args.props.onNodePriorityChange ?? (() => undefined)}
      onSelectBacklinkNode={args.props.onSelectNode}
      onSelectBreadcrumbNode={breadcrumb.onSelectBreadcrumbNode}
      onToggleSourceUpdatePanel={args.onToggleSourceUpdatePanel}
      priorityQuickSetShortcutLabel={args.props.priorityQuickSetShortcutLabel ?? ''}
      reviewSchedulerSettings={args.props.reviewSchedulerSettings ?? DEFAULT_REVIEW_SCHEDULER_SETTINGS}
      showDocumentControls
      showSourceUpdateAction={args.showSourceUpdateAction}
    />
  );
}
