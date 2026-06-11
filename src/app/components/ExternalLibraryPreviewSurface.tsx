import type { CSSProperties } from 'react';
import { useRef } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { ExternalDocumentPreview } from '../../shared/platform/externalDocumentPreviewRepository';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

import { DocumentPanelHeader } from './DocumentPanelHeader';
import {
  normalizeExternalDirectoryPath,
  resolveExternalFolderDisplayLabel,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';
import { LinkPanelStack } from './LinkPanelStack';
import { useExternalLinkPanels } from './useExternalLinkPanels';

export function ExternalLibraryPreviewSurface(args: {
  canGoBack: boolean;
  canGoForward: boolean;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  isImporting: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onHandleImport: () => void;
  onOpenImportedNodeId: (nodeId: string) => void;
  onOpenSelection: (selection: ExternalLibrarySelection) => void;
  onPreviewEditorReady: (adapter: EditorAdapter | null) => void;
  preview: ExternalDocumentPreview;
}) {
  const t = useTranslation();
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const { handleCloseExternalLink, handleLinkPanelStateChange, handleOpenExternalLink, linkPanels } = useExternalLinkPanels();

  return (
    <section aria-label={t('desktop.externalLibrary.documentArea')} className="workspace-region-main-document flex min-h-0 flex-1 flex-col" style={toDocumentWidthStyle(args.documentMaxWidth)}>
      <ExternalPreviewHeader
        canGoBack={args.canGoBack}
        canGoForward={args.canGoForward}
        onGoBack={args.onGoBack}
        onGoForward={args.onGoForward}
        onHandleImport={args.onHandleImport}
        onOpenImportedNodeId={args.onOpenImportedNodeId}
        onOpenSelection={args.onOpenSelection}
        preview={args.preview}
        isImporting={args.isImporting}
      />
      <div
        className="relative flex min-h-0 flex-1 flex-col pl-4 pr-0 pt-2 pb-0 max-[1080px]:pl-2 max-[1080px]:pr-0 max-[1080px]:pt-2 max-[1080px]:pb-0"
        ref={contentAreaRef}
      >
        <ExternalArchivedNotice isPresent={args.preview.isPresent} />
        <MarkdownEditor
          blockImageMaxHeightOverride={520}
          blockImageWidthOverride="min(100%, 40rem)"
          className="min-h-0 flex-1"
          key={`external-library-${args.editorAppearanceKey}-${args.preview.absolutePath}`}
          nodeId={null}
          onChange={() => undefined}
          onOpenExternalLink={handleOpenExternalLink}
          onReady={args.onPreviewEditorReady}
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

function ExternalArchivedNotice(args: { isPresent?: boolean | undefined }) {
  const t = useTranslation();
  if (args.isPresent !== false) {
    return null;
  }
  return (
    <div className="mx-auto mb-2 w-full max-w-[var(--document-max-width)] px-[var(--document-content-inline-padding)]">
      <div className="rounded-md border border-border/70 bg-panel px-3 py-2 text-sm text-foreground/70">
        {t('desktop.externalLibrary.preview.archivedNotice')}
      </div>
    </div>
  );
}

function toDocumentWidthStyle(documentMaxWidth: number) {
  return { '--document-max-width': `${documentMaxWidth}px` } as CSSProperties;
}

function ExternalPreviewHeader(args: {
  canGoBack: boolean;
  canGoForward: boolean;
  isImporting: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onHandleImport: () => void;
  onOpenImportedNodeId: (nodeId: string) => void;
  onOpenSelection: (selection: ExternalLibrarySelection) => void;
  preview: ExternalDocumentPreview;
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
        rightSlot={(
          <ExternalImportAction
            importedNodeId={args.preview.importedNodeId ?? null}
            isImporting={args.isImporting}
            onHandleImport={args.onHandleImport}
            onOpenImportedNodeId={args.onOpenImportedNodeId}
          />
        )}
        showDocumentControls={false}
        showSourceUpdateAction={false}
      />
    </div>
  );
}

function ExternalImportAction(args: {
  importedNodeId: string | null;
  isImporting: boolean;
  onHandleImport: () => void;
  onOpenImportedNodeId: (nodeId: string) => void;
}) {
  const t = useTranslation();
  const isImported = Boolean(args.importedNodeId);
  const label = isImported ? t('desktop.externalLibrary.preview.imported') : t('desktop.externalLibrary.preview.import');
  const actionLabel = isImported ? t('desktop.externalLibrary.preview.openImported') : t('desktop.externalLibrary.preview.importToFoliole');
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <button
          aria-label={actionLabel}
          className="inline-block border-0 bg-transparent p-0 text-sm font-normal leading-[1.25] text-foreground/45 transition-colors hover:text-foreground/65 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
          disabled={args.isImporting}
          onClick={() => {
            if (args.importedNodeId) {
              args.onOpenImportedNodeId(args.importedNodeId);
              return;
            }
            args.onHandleImport();
          }}
          type="button"
        >
          {label}
        </button>
      </AppTooltipTrigger>
      <AppTooltipContent side="bottom">{actionLabel}</AppTooltipContent>
    </AppTooltip>
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

function buildExternalBreadcrumbModel(preview: ExternalDocumentPreview) {
  const nodesById: Record<string, Node> = {};
  const selectionsByNodeId: Record<string, ExternalLibrarySelection> = {};
  const rootId = `external:${preview.folderId}`;
  let parentNodeId: string | null = rootId;
  const folderTitle = resolveExternalFolderDisplayLabel({
    folderPath: preview.folderPath,
    id: preview.folderId
  });
  nodesById[rootId] = createExternalHeaderNode(rootId, null, folderTitle, 'folder');
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
