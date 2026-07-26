import type { EditorSearchDecorations } from '../../features/editor/adapters/EditorAdapter';
import {
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import { isVirtualNode, isVirtualRootNode } from '../../features/nodes/model/specialNodes';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';

import { DocumentPanelContentAssembly } from './DocumentPanelContentAssembly';
import { renderDocumentPanelHeader } from './DocumentPanelHeaderChrome';
import { FolderListHeaderNavigation } from './DocumentPanelHeaderNavigation';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import type { CentralPanelKind } from './documentPanelSectionModel';
import { DocumentPanelContent } from './DocumentPanelSectionParts';
import { DocumentPriorityQuickSetHint } from './DocumentPriorityQuickSetHint';
import { DocumentTopicSearchToolbar } from './DocumentTopicSearchToolbar';
import type { LinkPanelRecord } from './linkPanelState';
import { useDocumentPanelFolderListSort } from './useDocumentPanelFolderListSort';

interface DocumentPanelShellProps {
  backlinks: BacklinkItem[];
  bodyProps: Parameters<typeof DocumentPanelContent>[0]['bodyProps'];
  canOpenComparisonView: boolean;
  isFolderListView: boolean;
  panelKind: CentralPanelKind;
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
  canOpenComparisonView: boolean;
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
        canOpenComparisonView: args.canOpenComparisonView,
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

export function DocumentPanelSectionShell({
  backlinks,
  bodyProps,
  canOpenComparisonView,
  isFolderListView,
  panelKind,
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
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : null;
  const folderListSort = useDocumentPanelFolderListSort(
    props.activeNodeId,
    Boolean(isFolderListView && activeNode?.kind === 'folder' && activeNode.manualChildOrder?.length)
  );
  const folderListSortKey = folderListSort.key;
  const folderListSortDirection = folderListSort.direction;

  const overlay = renderFolderNavigationOverlay(props, isFolderListView);
  const chrome = renderDocumentPanelChrome({
    backlinks,
    canOpenComparisonView,
    folderListSortDirection,
    folderListSortKey,
    isFolderListView,
    isSourceUpdatePanelOpen,
    onPreviewDocumentSelection,
    onPreviewTopicSearchDecorations,
    onToggleSourceUpdatePanel,
    props,
    setFolderListSortDirection: folderListSort.setDirection,
    setFolderListSortKey: folderListSort.setKey,
    showSourceUpdateAction
  });
  return (
    <DocumentPanelContentAssembly
      bodyProps={bodyProps}
      chrome={chrome}
      folderListSortDirection={folderListSortDirection}
      folderListSortKey={folderListSortKey}
      isFolderListView={isFolderListView}
      panelKind={panelKind}
      linkPanels={linkPanels}
      onChangeFolderListSortDirection={folderListSort.setDirection}
      onChangeFolderListSortKey={folderListSort.setKey}
      onCloseExternalLink={onCloseExternalLink}
      onLinkPanelStateChange={onLinkPanelStateChange}
      onOpenExternalLink={onOpenExternalLink}
      overlay={overlay}
      props={props}
    />
  );
}
