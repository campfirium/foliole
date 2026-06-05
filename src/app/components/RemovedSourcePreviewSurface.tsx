import type { CSSProperties, RefObject } from 'react';
import { useRef, useState } from 'react';

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { restoreRuntimeRemovedSource } from '../../shared/platform/removedSourcesRuntimeRepository';
import { AppEmptyState } from '../../shared/ui';

import { DocumentPanelHeader } from './DocumentPanelHeader';
import { DocumentRestoreAction } from './DocumentRestoreAction';
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
  const t = useTranslation();
  return (
    <DocumentRestoreAction
      ariaLabel={t('desktop.removed.preview.reimport')}
      disabled={props.isImporting}
      label={props.isImporting ? t('desktop.removed.preview.reimporting') : props.needsSourceUpdateConfirm ? t('desktop.removed.preview.reimportCurrent') : t('desktop.removed.preview.reimport')}
      onRestore={props.onImport}
    />
  );
}

function RemovedPreviewHeader(props: {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
}) {
  const t = useTranslation();
  const rootId = 'removed-root';
  const activeNodeId = 'removed-preview';
  const nodesById = {
    [rootId]: createHeaderNode(rootId, null, t('desktop.removed.preview.root'), 'folder'),
    [activeNodeId]: createHeaderNode(activeNodeId, rootId, '', 'topic')
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

function useRemovedSourceImportAction(entry: SelectedRemovedSource | null, onSelectNode: (nodeId: string) => void, t: Translate) {
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
        setErrorMessage(result?.detail?.trim() || t('desktop.removed.importFailed'));
        return;
      }
      setSelectedRemovedSource(null);
      if (result.node_id) onSelectNode(result.node_id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('desktop.removed.importFailed'));
    } finally {
      setIsImporting(false);
    }
  }

  return { confirmId, errorMessage, importSelectedSource, isImporting };
}

function RemovedSourceEmptySurface() {
  const t = useTranslation();
  return (
    <section aria-label={t('desktop.document.area')} className="workspace-region-main-document flex min-h-0 flex-1 items-center justify-center px-6">
      <AppEmptyState description={t('desktop.removed.preview.empty.description')} title={t('desktop.removed.preview.empty.title')} />
    </section>
  );
}

function RemovedSourcePreviewContent(props: {
  confirmId: string | null;
  contentAreaRef: RefObject<HTMLDivElement>;
  editorAppearanceKey: string;
  entry: SelectedRemovedSource;
  errorMessage: string;
  importSelectedSource: () => Promise<void>;
  isImporting: boolean;
  linkPanels: ReturnType<typeof useExternalLinkPanels>['linkPanels'];
  onCloseExternalLink: ReturnType<typeof useExternalLinkPanels>['handleCloseExternalLink'];
  onLinkPanelStateChange: ReturnType<typeof useExternalLinkPanels>['handleLinkPanelStateChange'];
  onOpenExternalLink: ReturnType<typeof useExternalLinkPanels>['handleOpenExternalLink'];
}) {
  const t = useTranslation();
  return (
    <div className="relative flex min-h-0 flex-1 flex-col pl-4 pr-0 pt-2 pb-0 max-[1080px]:pl-2 max-[1080px]:pr-0 max-[1080px]:pt-2 max-[1080px]:pb-0" ref={props.contentAreaRef}>
      <RemovedImportAction
        isImporting={props.isImporting}
        needsSourceUpdateConfirm={props.confirmId === props.entry.id}
        onImport={() => void props.importSelectedSource()}
      />
      {props.confirmId === props.entry.id ? (
        <p className="mx-auto w-full max-w-[var(--document-max-width)] px-[var(--document-content-inline-padding)] py-2 text-sm text-foreground/70">
          {t('desktop.removed.preview.changedSource')}
        </p>
      ) : null}
      {props.errorMessage ? (
        <p className="mx-auto w-full max-w-[var(--document-max-width)] px-[var(--document-content-inline-padding)] py-2 text-sm text-red-700">{props.errorMessage}</p>
      ) : null}
      <MarkdownEditor
        blockImageMaxHeightOverride={520}
        blockImageWidthOverride="min(100%, 40rem)"
        className="min-h-0 flex-1"
        key={`removed-${props.editorAppearanceKey}-${props.entry.id}`}
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
  editorAppearanceKey: string;
  onGoBack: () => void;
  onGoForward: () => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const t = useTranslation();
  const entry = useSelectedRemovedSource();
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const { handleCloseExternalLink, handleLinkPanelStateChange, handleOpenExternalLink, linkPanels } = useExternalLinkPanels();
  const importAction = useRemovedSourceImportAction(entry, props.onSelectNode, t);
  const style = { '--document-max-width': `${props.documentMaxWidth}px` } as CSSProperties;

  if (!entry) {
    return <RemovedSourceEmptySurface />;
  }

  return (
    <section aria-label={t('desktop.document.area')} className="workspace-region-main-document flex min-h-0 flex-1 flex-col" style={style}>
      <RemovedPreviewHeader
        canGoBack={props.canGoBack}
        canGoForward={props.canGoForward}
        onGoBack={props.onGoBack}
        onGoForward={props.onGoForward}
      />
      <RemovedSourcePreviewContent
        confirmId={importAction.confirmId}
        contentAreaRef={contentAreaRef}
        editorAppearanceKey={props.editorAppearanceKey}
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
