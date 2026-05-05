import type { CSSProperties } from 'react';
import { useRef } from 'react';

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import type { RuntimeExternalSearchPreview } from '../../shared/platform/externalSearchRuntimeRepository';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

import { DocumentPanelHeader } from './DocumentPanelHeader';
import {
  normalizeExternalDirectoryPath,
  resolveExternalFolderLabel,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';
import { LinkPanelStack } from './LinkPanelStack';
import { useExternalLinkPanels } from './useExternalLinkPanels';

export function ExternalLibraryPreviewSurface(args: {
  canGoBack: boolean;
  canGoForward: boolean;
  documentMaxWidth: number;
  isImporting: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onHandleImport: () => void;
  onOpenSelection: (selection: ExternalLibrarySelection) => void;
  preview: RuntimeExternalSearchPreview;
}) {
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const { handleCloseExternalLink, handleLinkPanelStateChange, handleOpenExternalLink, linkPanels } = useExternalLinkPanels();

  const style = {
    '--document-max-width': `${args.documentMaxWidth}px`
  } as CSSProperties;

  return (
    <section aria-label="Document area" className="workspace-region-main-document flex min-h-0 flex-1 flex-col" style={style}>
      <ExternalPreviewHeader
        canGoBack={args.canGoBack}
        canGoForward={args.canGoForward}
        onGoBack={args.onGoBack}
        onGoForward={args.onGoForward}
        onOpenSelection={args.onOpenSelection}
        preview={args.preview}
      />
      <div
        className="relative flex min-h-0 flex-1 flex-col pl-4 pr-0 pt-2 pb-0 max-[1080px]:pl-2 max-[1080px]:pr-0 max-[1080px]:pt-2 max-[1080px]:pb-0"
        ref={contentAreaRef}
      >
        <ExternalImportAction
          isImporting={args.isImporting}
          onHandleImport={args.onHandleImport}
        />
        <MarkdownEditor
          blockImageMaxHeightOverride={520}
          blockImageWidthOverride="min(100%, 40rem)"
          className="min-h-0 flex-1"
          nodeId={args.preview.absolutePath}
          onChange={() => undefined}
          onOpenExternalLink={handleOpenExternalLink}
          readOnly
          value={args.preview.content}
        />
        <LinkPanelStack
          anchorRootRef={contentAreaRef}
          onClose={handleCloseExternalLink}
          onStateChange={handleLinkPanelStateChange}
          panels={linkPanels}
        />
      </div>
    </section>
  );
}

function ExternalPreviewHeader(args: {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onOpenSelection: (selection: ExternalLibrarySelection) => void;
  preview: RuntimeExternalSearchPreview;
}) {
  const breadcrumbModel = buildExternalBreadcrumbModel(args.preview);
  return (
    <div>
      <DocumentPanelHeader
        activeNodeId={breadcrumbModel.activeNodeId}
        backlinks={[]}
        canGoBack={args.canGoBack}
        canGoForward={args.canGoForward}
        canGoParent={false}
        editableNodeId={null}
        folderListToolbar={null}
        isFolderListView={false}
        isSourceUpdatePanelOpen={false}
        nodesById={breadcrumbModel.nodesById}
        onGoBack={args.onGoBack}
        onGoForward={args.onGoForward}
        onGoParent={() => undefined}
        onNodePriorityChange={() => undefined}
        onSelectBacklinkNode={() => undefined}
        onSelectBreadcrumbNode={(nodeId) => {
          const selection = breadcrumbModel.selectionsByNodeId[nodeId];
          if (selection) args.onOpenSelection(selection);
        }}
        onToggleSourceUpdatePanel={() => undefined}
        priorityQuickSetShortcutLabel=""
        reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
        showDocumentControls={false}
        showSourceUpdateAction={false}
      />
    </div>
  );
}

function ExternalImportAction(args: {
  isImporting: boolean;
  onHandleImport: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-5 z-[2] overflow-visible">
      <div className="mx-auto flex w-full max-w-[var(--document-max-width)] justify-end px-[var(--document-content-inline-padding)]">
        <AppTooltip>
          <AppTooltipTrigger asChild>
            <button
              aria-label="Import to Foliole"
              className="pointer-events-auto inline-flex h-10 min-w-20 translate-x-[calc(100%+theme(spacing.3))] items-center justify-center rounded-md border border-transparent bg-[var(--app-accent-color)] px-4 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-[rgb(var(--app-accent-color-rgb)/0.88)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 max-[1280px]:translate-x-0"
              disabled={args.isImporting}
              onClick={args.onHandleImport}
              type="button"
            >
              Import
            </button>
          </AppTooltipTrigger>
          <AppTooltipContent side="left">Import to Foliole</AppTooltipContent>
        </AppTooltip>
      </div>
    </div>
  );
}

function createExternalHeaderNode(id: string, parentNodeId: string | null, title: string, kind: Node['kind']): Node {
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

function buildExternalBreadcrumbModel(preview: RuntimeExternalSearchPreview) {
  const nodesById: Record<string, Node> = {};
  const selectionsByNodeId: Record<string, ExternalLibrarySelection> = {};
  const rootId = `external:${preview.folderId}`;
  let parentNodeId: string | null = rootId;
  nodesById[rootId] = createExternalHeaderNode(rootId, null, resolveExternalFolderLabel(preview.folderPath), 'folder');
  selectionsByNodeId[rootId] = { folderId: preview.folderId, kind: 'folder' };

  resolveExternalDirectorySegments(preview.relativePath).forEach((segment, index, segments) => {
    const directoryPath = segments.slice(0, index + 1).join('/');
    const nodeId = `${rootId}:${directoryPath}`;
    nodesById[nodeId] = createExternalHeaderNode(nodeId, parentNodeId, segment, 'folder');
    selectionsByNodeId[nodeId] = { directoryPath, folderId: preview.folderId, kind: 'directory' };
    parentNodeId = nodeId;
  });

  const activeNodeId = `${rootId}:${preview.absolutePath}`;
  nodesById[activeNodeId] = createExternalHeaderNode(activeNodeId, parentNodeId, preview.fileName, 'topic');
  return { activeNodeId, nodesById, selectionsByNodeId };
}

function resolveExternalDirectorySegments(relativePath: string) {
  const segments = normalizeExternalDirectoryPath(relativePath).split('/').filter(Boolean);
  segments.pop();
  return segments;
}
