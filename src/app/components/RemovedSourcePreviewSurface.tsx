import type { CSSProperties, RefObject } from 'react';
import { useRef, useState } from 'react';

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import { restoreRuntimeRemovedSource } from '../../shared/platform/removedSourcesRuntimeRepository';
import { AppEmptyState, AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

import { DocumentPanelHeader } from './DocumentPanelHeader';
import { LinkPanelStack } from './LinkPanelStack';
import { setSelectedRemovedSource, useSelectedRemovedSource } from './removedSourceSelectionStore';
import { useExternalLinkPanels } from './useExternalLinkPanels';

type SelectedRemovedSource = NonNullable<ReturnType<typeof useSelectedRemovedSource>>;

function createHeaderNode(id: string, parentNodeId: string | null, title: string, kind: Node['kind']): Node {
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

function buildPreviewContent(entry: SelectedRemovedSource) {
  return entry.content?.trim() || `# ${entry.title}`;
}

function RemovedImportAction(props: {
  isImporting: boolean;
  needsSourceUpdateConfirm: boolean;
  onImport: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-5 z-local-overlay overflow-visible">
      <div className="mx-auto flex w-full max-w-[var(--document-max-width)] justify-end px-[var(--document-content-inline-padding)]">
        <AppTooltip>
          <AppTooltipTrigger asChild>
            <button
              aria-label="Import to Foliole"
              className="pointer-events-auto inline-flex h-10 min-w-20 translate-x-[calc(100%+theme(spacing.3))] items-center justify-center rounded-md border border-transparent bg-[var(--app-accent-color)] px-4 text-sm font-medium text-accent-foreground shadow-control transition-colors hover:bg-[rgb(var(--app-accent-color-rgb)/0.88)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 max-[1280px]:translate-x-0"
              disabled={props.isImporting}
              onClick={props.onImport}
              type="button"
            >
              {props.isImporting ? 'Importing...' : props.needsSourceUpdateConfirm ? 'Import current source' : 'Import'}
            </button>
          </AppTooltipTrigger>
          <AppTooltipContent side="left">Import to Foliole</AppTooltipContent>
        </AppTooltip>
      </div>
    </div>
  );
}

function RemovedPreviewHeader(props: {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  title: string;
}) {
  const rootId = 'removed-root';
  const activeNodeId = 'removed-preview';
  const nodesById = {
    [rootId]: createHeaderNode(rootId, null, 'Removed', 'folder'),
    [activeNodeId]: createHeaderNode(activeNodeId, rootId, props.title, 'topic')
  };
  return (
    <DocumentPanelHeader
      activeNodeId={activeNodeId}
      backlinks={[]}
      canGoBack={props.canGoBack}
      canGoForward={props.canGoForward}
      canGoParent={false}
      editableNodeId={null}
      folderListToolbar={null}
      isFolderListView={false}
      isSourceUpdatePanelOpen={false}
      nodesById={nodesById}
      onGoBack={props.onGoBack}
      onGoForward={props.onGoForward}
      onGoParent={() => undefined}
      onNodePriorityChange={() => undefined}
      onSelectBacklinkNode={() => undefined}
      onSelectBreadcrumbNode={() => undefined}
      onToggleSourceUpdatePanel={() => undefined}
      priorityQuickSetShortcutLabel=""
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
      showDocumentControls={false}
      showSourceUpdateAction={false}
    />
  );
}

function useRemovedSourceImportAction(entry: SelectedRemovedSource | null, onSelectNode: (nodeId: string) => void) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  async function importSelectedSource() {
    if (!entry) return;
    setErrorMessage('');
    if (entry.hasSourceUpdate && confirmId !== entry.id) {
      setConfirmId(entry.id);
      return;
    }
    setIsImporting(true);
    try {
      const result = await restoreRuntimeRemovedSource(entry);
      if (!result || result.status === 'failed') {
        setErrorMessage(result?.detail?.trim() || 'Import failed.');
        return;
      }
      setSelectedRemovedSource(null);
      if (result.node_id) onSelectNode(result.node_id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  }

  return { confirmId, errorMessage, importSelectedSource, isImporting };
}

function RemovedSourceEmptySurface() {
  return (
    <section aria-label="Document area" className="workspace-region-main-document flex min-h-0 flex-1 items-center justify-center px-6">
      <AppEmptyState description="Select a removed topic to preview it." title="No topic selected" />
    </section>
  );
}

function RemovedSourcePreviewContent(props: {
  confirmId: string | null;
  contentAreaRef: RefObject<HTMLDivElement>;
  entry: SelectedRemovedSource;
  errorMessage: string;
  importSelectedSource: () => Promise<void>;
  isImporting: boolean;
  linkPanels: ReturnType<typeof useExternalLinkPanels>['linkPanels'];
  onCloseExternalLink: ReturnType<typeof useExternalLinkPanels>['handleCloseExternalLink'];
  onLinkPanelStateChange: ReturnType<typeof useExternalLinkPanels>['handleLinkPanelStateChange'];
  onOpenExternalLink: ReturnType<typeof useExternalLinkPanels>['handleOpenExternalLink'];
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col pl-4 pr-0 pt-2 pb-0 max-[1080px]:pl-2 max-[1080px]:pr-0 max-[1080px]:pt-2 max-[1080px]:pb-0" ref={props.contentAreaRef}>
      <RemovedImportAction
        isImporting={props.isImporting}
        needsSourceUpdateConfirm={props.confirmId === props.entry.id}
        onImport={() => void props.importSelectedSource()}
      />
      {props.confirmId === props.entry.id ? (
        <p className="mx-auto w-full max-w-[var(--document-max-width)] px-[var(--document-content-inline-padding)] py-2 text-sm text-foreground/70">
          The source changed after this topic was deleted. Import will use the current source text.
        </p>
      ) : null}
      {props.errorMessage ? (
        <p className="mx-auto w-full max-w-[var(--document-max-width)] px-[var(--document-content-inline-padding)] py-2 text-sm text-red-700">{props.errorMessage}</p>
      ) : null}
      <MarkdownEditor
        blockImageMaxHeightOverride={520}
        blockImageWidthOverride="min(100%, 40rem)"
        className="min-h-0 flex-1"
        nodeId={props.entry.id}
        onChange={() => undefined}
        onOpenExternalLink={props.onOpenExternalLink}
        readOnly
        value={buildPreviewContent(props.entry)}
      />
      <LinkPanelStack
        anchorRootRef={props.contentAreaRef}
        onClose={props.onCloseExternalLink}
        onStateChange={props.onLinkPanelStateChange}
        panels={props.linkPanels}
      />
    </div>
  );
}

export function RemovedSourcePreviewSurface(props: {
  canGoBack: boolean;
  canGoForward: boolean;
  documentMaxWidth: number;
  onGoBack: () => void;
  onGoForward: () => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const entry = useSelectedRemovedSource();
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const { handleCloseExternalLink, handleLinkPanelStateChange, handleOpenExternalLink, linkPanels } = useExternalLinkPanels();
  const importAction = useRemovedSourceImportAction(entry, props.onSelectNode);
  const style = { '--document-max-width': `${props.documentMaxWidth}px` } as CSSProperties;

  if (!entry) {
    return <RemovedSourceEmptySurface />;
  }

  return (
    <section aria-label="Document area" className="workspace-region-main-document flex min-h-0 flex-1 flex-col" style={style}>
      <RemovedPreviewHeader
        canGoBack={props.canGoBack}
        canGoForward={props.canGoForward}
        onGoBack={props.onGoBack}
        onGoForward={props.onGoForward}
        title={entry.title}
      />
      <RemovedSourcePreviewContent
        confirmId={importAction.confirmId}
        contentAreaRef={contentAreaRef}
        entry={entry}
        errorMessage={importAction.errorMessage}
        importSelectedSource={importAction.importSelectedSource}
        isImporting={importAction.isImporting}
        linkPanels={linkPanels}
        onCloseExternalLink={handleCloseExternalLink}
        onLinkPanelStateChange={handleLinkPanelStateChange}
        onOpenExternalLink={handleOpenExternalLink}
      />
    </section>
  );
}
