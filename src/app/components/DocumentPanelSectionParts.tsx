import type { ComponentProps } from 'react';

import { VirtualNodeDetailView } from '../../features/nodes/components/VirtualNodeDetailView';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';
import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';
import { AppEmptyState } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { EditorContextMenu } from './EditorContextMenu';
import { FolderListView } from './FolderListView';
import { PdfDocumentSurface } from './PdfDocumentSurface';
import { ReadwiseBookActionsPanel } from './ReadwiseBookActionsPanel';
import { useNodeSourceDetails } from './useNodeSourceDetails';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

interface DocumentPanelContentProps {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  isFolderListView: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onPersistPdfViewState: (viewState: NodeViewState) => void;
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

function resolvePdfSourceHint(details: RuntimeNodeSourceDetails) {
  return details.keepImportItem?.resolvedSourcePath || details.keepImportItem?.sourcePath || details.importSource?.sourceLocator || null;
}

function resolvePdfDocumentSurface(
  isLoading: boolean,
  details: RuntimeNodeSourceDetails | null
): { sourceHint: string | null; state: PdfDocumentSurfaceState } | null {
  if (!isPdfSourceDetails(details) || !details) {
    return null;
  }

  const sourceHint = resolvePdfSourceHint(details);
  if (isLoading) {
    return { sourceHint, state: 'loading' };
  }
  if (details.keepImportItem?.lastStatus === 'failed') {
    return { sourceHint, state: 'failed' };
  }
  if (!sourceHint) {
    return { sourceHint: null, state: 'empty' };
  }
  return { sourceHint, state: 'ready' };
}

function renderPdfStateSurface(state: Exclude<PdfDocumentSurfaceState, 'ready'>) {
  if (state === 'loading') {
    return (
      <div data-testid="pdf-document-state-loading">
        <AppEmptyState description="The reading container is checking the linked PDF source." title="Loading PDF reader" />
      </div>
    );
  }
  if (state === 'failed') {
    return (
      <div data-testid="pdf-document-state-failed">
        <AppEmptyState
          description="The PDF node was found, but the linked file could not be prepared. Re-import or reconnect the source."
          title="PDF reader failed"
        />
      </div>
    );
  }
  return (
    <div data-testid="pdf-document-state-empty">
      <AppEmptyState description="This PDF node uses the reader, but no file is linked yet." title="PDF file not linked yet" />
    </div>
  );
}

function renderPdfDocumentSurface(
  pdfDocumentSurface: { sourceHint: string | null; state: PdfDocumentSurfaceState },
  pdfViewContext: {
    editorNodeId: string | null;
    editorNodeViewState: ComponentProps<typeof DocumentPanelBody>['editorNodeViewState'];
  },
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean,
  onPersistPdfViewState: (viewState: NodeViewState) => void
) {
  if (pdfDocumentSurface.state === 'ready') {
    return (
      <PdfDocumentSurface
        nodeViewState={pdfViewContext.editorNodeViewState}
        onCreateHighlightFromSelection={onCreatePdfHighlight}
        onPersistViewState={onPersistPdfViewState}
        nodeId={pdfViewContext.editorNodeId}
        sourceHint={pdfDocumentSurface.sourceHint ?? ''}
      />
    );
  }

  return (
    <section aria-label="PDF reader panel" className="flex min-h-0 flex-1 flex-col bg-bg-panel" data-testid="pdf-document-surface">
      <div className="mx-auto flex min-h-0 w-full max-w-[var(--document-max-width)] flex-1 flex-col px-6 py-5 max-[1080px]:px-4">
        <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-xl border border-border bg-bg-elevated px-6 py-8 shadow-sm">
          {renderPdfStateSurface(pdfDocumentSurface.state)}
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
  onCreatePdfHighlight,
  onNodeContentChange,
  onPersistPdfViewState,
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
    return renderPdfDocumentSurface(
      pdfDocumentSurface,
      { editorNodeId: bodyProps.editorNodeId, editorNodeViewState: bodyProps.editorNodeViewState },
      onCreatePdfHighlight,
      onPersistPdfViewState
    );
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
