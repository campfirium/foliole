import { useState } from 'react';

import type { EditorSearchDecorations } from '../../features/editor/adapters/EditorAdapter';
import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';

import { DocumentPanelHeader } from './DocumentPanelHeader';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import { DocumentPanelContent } from './DocumentPanelSectionParts';
import { DocumentPriorityQuickSetHint } from './DocumentPriorityQuickSetHint';
import { DocumentTopicSearchToolbar } from './DocumentTopicSearchToolbar';
import { FolderListSortControls } from './FolderListSortControls';

interface DocumentPanelShellProps {
  backlinks: BacklinkItem[];
  bodyProps: Parameters<typeof DocumentPanelContent>[0]['bodyProps'];
  isFolderListView: boolean;
  isSourceUpdatePanelOpen: boolean;
  onPreviewDocumentSelection: DocumentPanelSectionProps['onRevealDocumentSelection'];
  onPreviewTopicSearchDecorations: (searchDecorations: EditorSearchDecorations | null) => void;
  onToggleSourceUpdatePanel: () => void;
  props: DocumentPanelSectionProps;
  showSourceUpdateAction: boolean;
}

function renderDocumentSearchToolbar(
  props: DocumentPanelSectionProps,
  onPreviewDocumentSelection: DocumentPanelSectionProps['onRevealDocumentSelection'],
  onPreviewTopicSearchDecorations: (searchDecorations: EditorSearchDecorations | null) => void
) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  return (
    <DocumentTopicSearchToolbar
      activeNode={activeNode}
      activeNodeId={props.activeNodeId}
      editorContent={props.editorContent}
      onRevealDocumentSelection={onPreviewDocumentSelection}
      onUpdateSearchDecorations={onPreviewTopicSearchDecorations}
    />
  );
}

function renderDocumentPanelHeader(args: {
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
      folderListToolbar={
        <FolderListSortControls
          onChangeSortDirection={args.onChangeSortDirection}
          onChangeSortKey={args.onChangeSortKey}
          sortDirection={args.folderListSortDirection}
          sortKey={args.folderListSortKey}
        />
      }
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

export function DocumentPanelSectionShell({
  backlinks,
  bodyProps,
  isFolderListView,
  isSourceUpdatePanelOpen,
  onPreviewDocumentSelection,
  onPreviewTopicSearchDecorations,
  onToggleSourceUpdatePanel,
  props,
  showSourceUpdateAction
}: DocumentPanelShellProps) {
  const [folderListSortKey, setFolderListSortKey] = useState<FolderListSortKey>(DEFAULT_FOLDER_LIST_SORT_KEY);
  const [folderListSortDirection, setFolderListSortDirection] = useState<FolderListSortDirection>(
    DEFAULT_FOLDER_LIST_SORT_DIRECTION
  );
  return (
    <section aria-label="Document panel" className="relative flex h-full min-h-0 flex-1 flex-col bg-bg-elevated text-foreground">
      {renderDocumentPanelHeader({
        backlinks,
        folderListSortDirection,
        folderListSortKey,
        isFolderListView,
        isSourceUpdatePanelOpen,
        onChangeSortDirection: setFolderListSortDirection,
        onChangeSortKey: setFolderListSortKey,
        onToggleSourceUpdatePanel,
        props,
        showSourceUpdateAction
      })}
      <DocumentPriorityQuickSetHint isActive={!isFolderListView && Boolean(props.isPriorityQuickSetActive)} />
      {renderDocumentSearchToolbar(props, onPreviewDocumentSelection, onPreviewTopicSearchDecorations)}
      <DocumentPanelContent
        activeNodeId={props.activeNodeId}
        bodyProps={bodyProps}
        folderListSortDirection={folderListSortDirection}
        folderListSortKey={folderListSortKey}
        onChangeFolderListSortDirection={setFolderListSortDirection}
        onChangeFolderListSortKey={setFolderListSortKey}
        isFolderListView={isFolderListView}
        nodeOrder={props.nodeOrder}
        trashedNodeIds={props.trashedNodeIds}
        nodesById={props.nodesById}
        onCreatePdfHighlight={props.onCreatePdfHighlight}
        onNodeContentChange={props.onNodeContentChange}
        onPersistPdfViewState={props.onPersistPdfViewState}
        onSelectNode={props.onSelectNode}
      />
    </section>
  );
}
