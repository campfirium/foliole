import type { ComponentProps } from 'react';

import { VirtualNodeDetailView } from '../../features/nodes/components/VirtualNodeDetailView';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';
import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';
import { AppEmptyState } from '../../shared/ui';

import { DocumentPanelBody } from './DocumentPanelBody';
import { EditorContextMenu } from './EditorContextMenu';
import { FolderListView } from './FolderListView';
import { ReadwiseBookActionsPanel } from './ReadwiseBookActionsPanel';
import { useNodeSourceDetails } from './useNodeSourceDetails';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

interface DocumentPanelContentProps {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  isFolderListView: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onSelectNode: (nodeId: string) => void;
}

interface DocumentPanelContextMenuProps {
  contextMenu: WorkspaceEditorContextMenu | null;
  onCloseContextMenu: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
}

type PdfDocumentSurfaceState = 'empty' | 'failed' | 'loading' | 'ready';

function isPdfPath(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().toLowerCase().endsWith('.pdf');
}

function isPdfSourceDetails(details: RuntimeNodeSourceDetails | null) {
  if (!details) {
    return false;
  }
  return details.importSource?.sourceKind.toLowerCase() === 'pdf' || isPdfPath(details.keepImportItem?.sourcePath);
}

function resolvePdfSourceLabel(details: RuntimeNodeSourceDetails) {
  return details.importSource?.sourceName || details.keepImportItem?.sourcePath || 'PDF document';
}

function resolvePdfSourceHint(details: RuntimeNodeSourceDetails) {
  return details.keepImportItem?.resolvedSourcePath || details.keepImportItem?.sourcePath || details.importSource?.sourceLocator || null;
}

function resolvePdfDocumentSurface(
  isLoading: boolean,
  details: RuntimeNodeSourceDetails | null
): { sourceHint: string | null; sourceLabel: string; state: PdfDocumentSurfaceState } | null {
  if (!isPdfSourceDetails(details) || !details) {
    return null;
  }

  const sourceHint = resolvePdfSourceHint(details);
  if (isLoading) {
    return { sourceHint, sourceLabel: resolvePdfSourceLabel(details), state: 'loading' };
  }
  if (details.keepImportItem?.lastStatus === 'failed') {
    return { sourceHint, sourceLabel: resolvePdfSourceLabel(details), state: 'failed' };
  }
  if (!sourceHint) {
    return { sourceHint: null, sourceLabel: resolvePdfSourceLabel(details), state: 'empty' };
  }
  return { sourceHint, sourceLabel: resolvePdfSourceLabel(details), state: 'ready' };
}

function PdfDocumentSurface({
  sourceHint,
  sourceLabel,
  state
}: {
  sourceHint: string | null;
  sourceLabel: string;
  state: PdfDocumentSurfaceState;
}) {
  return (
    <section aria-label="PDF reader panel" className="flex min-h-0 flex-1 flex-col bg-bg-panel" data-testid="pdf-document-surface">
      <div className="mx-auto flex min-h-0 w-full max-w-[var(--document-max-width)] flex-1 flex-col px-6 py-5 max-[1080px]:px-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">PDF reader*</p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">{sourceLabel}</p>
            <p className="mt-1 truncate text-[12px] text-foreground/50">{sourceHint ?? 'Source link will be connected in the next PDF task.'}</p>
          </div>
          <div className="flex min-h-[360px] flex-1 items-center justify-center px-6 py-8">
            {state === 'ready' ? (
              <div className="flex w-full max-w-3xl flex-col gap-4" data-testid="pdf-document-state-ready" role="status">
                <div className="rounded-lg border border-dashed border-border bg-bg-canvas px-6 py-16 text-center">
                  <p className="text-sm font-semibold text-foreground">PDF reading surface*</p>
                  <p className="mt-2 text-[13px] text-foreground/60">
                    This node now opens inside a stable PDF reading container. Rendering and reading controls connect in the next PDF task.
                  </p>
                </div>
              </div>
            ) : null}
            {state === 'loading' ? (
              <div data-testid="pdf-document-state-loading">
                <AppEmptyState
                  description="The reading container is checking the linked PDF source."
                  title="Loading PDF reader*"
                />
              </div>
            ) : null}
            {state === 'failed' ? (
              <div data-testid="pdf-document-state-failed">
                <AppEmptyState
                  description="The PDF node was found, but the linked file could not be prepared. Re-import or reconnect the source in a later PDF task."
                  title="PDF reader failed"
                />
              </div>
            ) : null}
            {state === 'empty' ? (
              <div data-testid="pdf-document-state-empty">
                <AppEmptyState
                  description="This PDF node already uses the reader shell, but no file is linked yet. The source connection arrives in the next PDF task."
                  title="PDF file not linked yet"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function DocumentPanelContent({
  activeNodeId,
  bodyProps,
  isFolderListView,
  nodeOrder,
  nodesById,
  onNodeContentChange,
  onSelectNode
}: DocumentPanelContentProps) {
  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const shouldLoadSourceDetails = Boolean(activeNodeId && activeNode && !isVirtualNode(activeNode) && !isFolderListView);
  const sourceDetails = useNodeSourceDetails(shouldLoadSourceDetails ? activeNodeId : null);
  const pdfDocumentSurface = resolvePdfDocumentSurface(sourceDetails.isLoading, sourceDetails.value);

  if (activeNode && isVirtualNode(activeNode)) {
    return (
      <VirtualNodeDetailView
        node={activeNode}
        nodesById={nodesById}
        onSelectNode={onSelectNode}
        onUpdateFilter={onNodeContentChange}
      />
    );
  }

  if (isFolderListView && activeNodeId) {
    return (
      <FolderListView
        folderNodeId={activeNodeId}
        nodeOrder={nodeOrder}
        nodesById={nodesById}
        onSelectNode={onSelectNode}
      />
    );
  }

  if (pdfDocumentSurface) {
    return <PdfDocumentSurface {...pdfDocumentSurface} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReadwiseBookActionsPanel activeNodeId={activeNodeId} />
      <DocumentPanelBody {...bodyProps} />
    </div>
  );
}

export function DocumentPanelContextMenu({
  contextMenu,
  onCloseContextMenu,
  onCopyImage,
  onCreateHighlight,
  onCreateCloze,
  onCutImage,
  onDeleteImage,
  onExportImage
}: DocumentPanelContextMenuProps) {
  if (!contextMenu) {
    return null;
  }

  return (
    <EditorContextMenu
      canRunCommands={contextMenu.canRunCommands}
      kind={contextMenu.kind}
      left={contextMenu.left}
      onClose={onCloseContextMenu}
      onCopyImage={onCopyImage}
      onCreateCloze={onCreateCloze}
      onCreateHighlight={onCreateHighlight}
      onCutImage={onCutImage}
      onDeleteImage={onDeleteImage}
      onExportImage={onExportImage}
      top={contextMenu.top}
    />
  );
}
