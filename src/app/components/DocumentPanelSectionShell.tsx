import { useState } from 'react';

import { DEFAULT_FOLDER_LIST_SORT_KEY, type FolderListSortKey } from '../../features/nodes/model/folderListOrdering';

import { DocumentPanelHeader } from './DocumentPanelHeader';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import { DocumentPanelContent } from './DocumentPanelSectionParts';
import { FolderListSortControls } from './FolderListSortControls';

interface DocumentPanelShellProps {
  bodyProps: Parameters<typeof DocumentPanelContent>[0]['bodyProps'];
  isFolderListView: boolean;
  isSourceUpdatePanelOpen: boolean;
  onToggleSourceUpdatePanel: () => void;
  props: DocumentPanelSectionProps;
  showSourceUpdateAction: boolean;
}

export function DocumentPanelSectionShell({
  bodyProps,
  isFolderListView,
  isSourceUpdatePanelOpen,
  onToggleSourceUpdatePanel,
  props,
  showSourceUpdateAction
}: DocumentPanelShellProps) {
  const [folderListSortKey, setFolderListSortKey] = useState<FolderListSortKey>(DEFAULT_FOLDER_LIST_SORT_KEY);

  return (
    <section aria-label="Document panel" className="flex h-full min-h-0 flex-1 flex-col bg-bg-elevated text-foreground">
      {isFolderListView ? null : (
        <DocumentPanelHeader
          activeNodeId={props.activeNodeId}
          canGoBack={props.canGoBack}
          canGoForward={props.canGoForward}
          canGoParent={props.canGoParent}
          folderListToolbar={<FolderListSortControls onChangeSortKey={setFolderListSortKey} sortKey={folderListSortKey} />}
          isFolderListView={isFolderListView}
          isSourceUpdatePanelOpen={isSourceUpdatePanelOpen}
          nodesById={props.nodesById}
          onGoBack={props.onGoBack}
          onGoForward={props.onGoForward}
          onGoParent={props.onGoParent}
          onSelectBreadcrumbNode={props.onSelectBreadcrumbNode}
          onToggleSourceUpdatePanel={onToggleSourceUpdatePanel}
          showSourceUpdateAction={showSourceUpdateAction}
        />
      )}
      <DocumentPanelContent
        activeNodeId={props.activeNodeId}
        bodyProps={bodyProps}
        folderListSortKey={folderListSortKey}
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
