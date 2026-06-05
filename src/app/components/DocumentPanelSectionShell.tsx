import { useState } from 'react';

import type { EditorSearchDecorations } from '../../features/editor/adapters/EditorAdapter';
import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import { isVirtualNode, isVirtualRootNode } from '../../features/nodes/model/specialNodes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';

import { renderDocumentPanelHeader } from './DocumentPanelHeaderChrome';
import { FolderListHeaderNavigation } from './DocumentPanelHeaderNavigation';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import { DocumentPanelContent } from './DocumentPanelSectionParts';
import { DocumentPriorityQuickSetHint } from './DocumentPriorityQuickSetHint';
import { DocumentTopicSearchToolbar } from './DocumentTopicSearchToolbar';
import type { LinkPanelRecord } from './linkPanelState';

interface DocumentPanelShellProps {
  backlinks: BacklinkItem[];
  bodyProps: Parameters<typeof DocumentPanelContent>[0]['bodyProps'];
  isFolderListView: boolean;
  isSourceUpdatePanelOpen: boolean;
  linkPanels: LinkPanelRecord[];
  onCloseExternalLink: (panelId: string) => void;
  onLinkPanelStateChange: (
    panelId: string,
    state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>
  ) => void;
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  onPreviewDocumentSelection: DocumentPanelSectionProps['onRevealDocumentSelection'];
  onPreviewTopicSearchDecorations: (searchDecorations: EditorSearchDecorations | null) => void;
  onToggleSourceUpdatePanel: () => void;
  props: DocumentPanelSectionProps;
  showSourceUpdateAction: boolean;
}

function resolvePriorityQuickSetValue(props: DocumentPanelSectionProps) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : null;
  return activeNode?.priority ?? 5;
}

function renderDocumentPanelChrome(args: {
  backlinks: BacklinkItem[];
  folderListSortDirection: FolderListSortDirection;
  folderListSortKey: FolderListSortKey;
  isFolderListView: boolean;
  isSourceUpdatePanelOpen: boolean;
  onPreviewDocumentSelection: DocumentPanelSectionProps['onRevealDocumentSelection'];
  onPreviewTopicSearchDecorations: (searchDecorations: EditorSearchDecorations | null) => void;
  onToggleSourceUpdatePanel: () => void;
  props: DocumentPanelSectionProps;
  setFolderListSortDirection: (value: FolderListSortDirection) => void;
  setFolderListSortKey: (value: FolderListSortKey) => void;
  showSourceUpdateAction: boolean;
}) {
  if (args.props.isImmersiveMode) {
    return null;
  }

  return (
    <>
      {renderDocumentPanelHeader({
        backlinks: args.backlinks,
        folderListSortDirection: args.folderListSortDirection,
        folderListSortKey: args.folderListSortKey,
        isFolderListView: args.isFolderListView,
        isSourceUpdatePanelOpen: args.isSourceUpdatePanelOpen,
        onChangeSortDirection: args.setFolderListSortDirection,
        onChangeSortKey: args.setFolderListSortKey,
        onToggleSourceUpdatePanel: args.onToggleSourceUpdatePanel,
        props: args.props,
        showSourceUpdateAction: args.showSourceUpdateAction
      })}
      <DocumentPriorityQuickSetHint
        isActive={!args.isFolderListView && Boolean(args.props.isPriorityQuickSetActive)}
        {...(args.props.activeNodeId && args.props.onNodePriorityChange
          ? { onPriorityChange: (priority: number) => args.props.onNodePriorityChange?.(args.props.activeNodeId!, priority) }
          : {})}
        priority={resolvePriorityQuickSetValue(args.props)}
      />
      {renderDocumentSearchToolbar(
        args.props,
        args.onPreviewDocumentSelection,
        args.onPreviewTopicSearchDecorations
      )}
    </>
  );
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

function renderFolderNavigationOverlay(props: DocumentPanelSectionProps, visible: boolean) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  if (!visible || props.isImmersiveMode || isVirtualNode(activeNode) || isVirtualRootNode(activeNode)) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute left-4 top-0 z-workspace-overlay max-[1080px]:left-2">
      <div className="pointer-events-auto">
        <FolderListHeaderNavigation
          canGoBack={props.canGoBack}
          canGoForward={props.canGoForward}
          canGoParent={props.canGoParent}
          onGoBack={props.onGoBack}
          onGoForward={props.onGoForward}
          onGoParent={props.onGoParent}
        />
      </div>
    </div>
  );
}

function renderDocumentPanelContent(args: {
  bodyProps: Parameters<typeof DocumentPanelContent>[0]['bodyProps'];
  folderListSortDirection: FolderListSortDirection;
  folderListSortKey: FolderListSortKey;
  isFolderListView: boolean;
  linkPanels: LinkPanelRecord[];
  onChangeFolderListSortDirection: (value: FolderListSortDirection) => void;
  onChangeFolderListSortKey: (value: FolderListSortKey) => void;
  onCloseExternalLink: (panelId: string) => void;
  onLinkPanelStateChange: (
    panelId: string,
    state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>
  ) => void;
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  props: DocumentPanelSectionProps;
}) {
  return (
    <DocumentPanelContent
      activeNodeId={args.props.activeNodeId}
      bodyProps={args.bodyProps}
      folderListSortDirection={args.folderListSortDirection}
      folderListSortKey={args.folderListSortKey}
      onChangeFolderListSortDirection={args.onChangeFolderListSortDirection}
      onChangeFolderListSortKey={args.onChangeFolderListSortKey}
      isFolderListView={args.isFolderListView}
      isTrashViewOpen={Boolean(args.props.isTrashViewOpen)}
      nodeOrder={args.props.nodeOrder}
      trashedNodeIds={args.props.trashedNodeIds}
      nodesById={args.props.nodesById}
      onCreatePdfHighlight={args.props.onCreatePdfHighlight}
      onNodeContentChange={args.props.onNodeContentChange}
      onOpenExternalLink={args.onOpenExternalLink}
      {...(args.props.onOpenMoveToNode ? { onOpenMoveToNode: args.props.onOpenMoveToNode } : {})}
      onPersistPdfViewState={args.props.onPersistPdfViewState}
      onSelectNode={args.props.onSelectNode}
      onSelectNodeInVirtualView={args.props.onSelectNodeInVirtualView ?? args.props.onSelectNode}
      onSelectTrashNode={args.props.onSelectTrashNode}
      linkPanels={args.linkPanels}
      onCloseExternalLink={args.onCloseExternalLink}
      onLinkPanelStateChange={args.onLinkPanelStateChange}
    />
  );
}

export function DocumentPanelSectionShell({
  backlinks,
  bodyProps,
  isFolderListView,
  isSourceUpdatePanelOpen,
  linkPanels,
  onCloseExternalLink,
  onLinkPanelStateChange,
  onOpenExternalLink,
  onPreviewDocumentSelection,
  onPreviewTopicSearchDecorations,
  onToggleSourceUpdatePanel,
  props,
  showSourceUpdateAction
}: DocumentPanelShellProps) {
  const t = useTranslation();
  const [folderListSortKey, setFolderListSortKey] = useState<FolderListSortKey>(DEFAULT_FOLDER_LIST_SORT_KEY);
  const [folderListSortDirection, setFolderListSortDirection] = useState<FolderListSortDirection>(
    DEFAULT_FOLDER_LIST_SORT_DIRECTION
  );

  return (
    <section aria-label={t('desktop.document.panel')} className="workspace-region-main-document relative flex h-full min-h-0 flex-1 flex-col text-foreground">
      {renderFolderNavigationOverlay(props, isFolderListView)}
      {renderDocumentPanelChrome({
        backlinks,
        folderListSortDirection,
        folderListSortKey,
        isFolderListView,
        isSourceUpdatePanelOpen,
        onPreviewDocumentSelection,
        onPreviewTopicSearchDecorations,
        onToggleSourceUpdatePanel,
        props,
        setFolderListSortDirection,
        setFolderListSortKey,
        showSourceUpdateAction
      })}
      {renderDocumentPanelContent({
        bodyProps,
        folderListSortDirection,
        folderListSortKey,
        isFolderListView,
        linkPanels,
        onChangeFolderListSortDirection: setFolderListSortDirection,
        onChangeFolderListSortKey: setFolderListSortKey,
        onCloseExternalLink,
        onLinkPanelStateChange,
        onOpenExternalLink,
        props
      })}
    </section>
  );
}
