import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';

import { DocumentPanelHeader } from './DocumentPanelHeader';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';

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
  if (args.isFolderListView) {
    return null;
  }

  return (
    <DocumentPanelHeader
      activeNodeId={args.props.activeNodeId}
      backlinks={args.backlinks}
      canGoBack={args.props.canGoBack}
      canGoForward={args.props.canGoForward}
      canGoParent={args.props.canGoParent}
      editableNodeId={args.props.editableNodeId}
      folderListToolbar={null}
      isFolderListView={args.isFolderListView}
      isSourceUpdatePanelOpen={args.isSourceUpdatePanelOpen}
      nodesById={args.props.nodesById}
      onGoBack={args.props.onGoBack}
      onGoForward={args.props.onGoForward}
      onGoParent={args.props.onGoParent}
      onNodePriorityChange={args.props.onNodePriorityChange ?? (() => undefined)}
      onSelectBacklinkNode={args.props.onSelectNode}
      onSelectBreadcrumbNode={args.props.onSelectBreadcrumbNode}
      onToggleSourceUpdatePanel={args.onToggleSourceUpdatePanel}
      priorityQuickSetShortcutLabel={args.props.priorityQuickSetShortcutLabel ?? ''}
      reviewSchedulerSettings={args.props.reviewSchedulerSettings ?? DEFAULT_REVIEW_SCHEDULER_SETTINGS}
      showSourceUpdateAction={args.showSourceUpdateAction}
    />
  );
}
