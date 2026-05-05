import type { ComponentProps } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';
import { AppEmptyState } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { PdfDocumentSurface } from './PdfDocumentSurface';
import type { PdfHighlightLocator } from './pdfHighlightLocators';
import type { PdfPageDimensions } from './pdfPageDimensions';

export type PdfDocumentSurfaceState = 'empty' | 'failed' | 'loading' | 'ready';
type PdfIndexStatus = 'failed' | 'indexing' | 'pending' | 'ready' | null;

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

function resolvePersistedPdfPageDimensions(details: RuntimeNodeSourceDetails): Record<number, PdfPageDimensions> {
  return Object.fromEntries(
    details.pdfPageDimensions.flatMap((entry) =>
      typeof entry.pageWidth === 'number' &&
      Number.isFinite(entry.pageWidth) &&
      entry.pageWidth > 0 &&
      typeof entry.pageHeight === 'number' &&
      Number.isFinite(entry.pageHeight) &&
      entry.pageHeight > 0
        ? [[entry.page, { height: entry.pageHeight, width: entry.pageWidth }] as const]
        : []
    )
  );
}

function resolvePersistedPdfPageCount(details: RuntimeNodeSourceDetails) {
  return details.pdfPageDimensions.reduce((maxPage, entry) => Math.max(maxPage, entry.page), 0) || null;
}

export function resolvePdfDocumentSurface(
  activeNodeId: string | null,
  isLoading: boolean,
  details: RuntimeNodeSourceDetails | null
): { details: RuntimeNodeSourceDetails; pdfIndexStatus: PdfIndexStatus; sourceHint: string | null; state: PdfDocumentSurfaceState } | null {
  if (!isPdfSourceDetails(details) || !details || details.inheritedFromParent) {
    return null;
  }
  if (activeNodeId !== details.sourceNodeId) {
    return null;
  }

  const sourceHint = resolvePdfSourceHint(details);
  if (details.keepImportItem?.lastStatus === 'failed') {
    return { details, pdfIndexStatus: details.importSource?.pdfIndexStatus ?? null, sourceHint, state: 'failed' };
  }
  if (!sourceHint) {
    return {
      details,
      pdfIndexStatus: details.importSource?.pdfIndexStatus ?? null,
      sourceHint: sourceHint ?? null,
      state: isLoading ? 'loading' : 'empty'
    };
  }
  return { details, pdfIndexStatus: details.importSource?.pdfIndexStatus ?? null, sourceHint, state: 'ready' };
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

export function renderPdfDocumentSurface(
  pdfDocumentSurface: { details: RuntimeNodeSourceDetails; pdfIndexStatus: PdfIndexStatus; sourceHint: string | null; state: PdfDocumentSurfaceState },
  pdfViewContext: {
    editorNodeId: string | null;
    editorNodeViewState: ComponentProps<typeof DocumentPanelBody>['editorNodeViewState'];
  },
  highlightLocators: PdfHighlightLocator[],
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean,
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void
) {
  if (pdfDocumentSurface.state === 'ready') {
    return (
      <PdfDocumentSurface
        highlightLocators={highlightLocators}
        isVisible
        nodeViewState={pdfViewContext.editorNodeViewState}
        onCreateHighlightFromSelection={onCreatePdfHighlight}
        onPersistViewState={(viewState) => {
          if (pdfViewContext.editorNodeId) {
            onPersistPdfViewState(pdfViewContext.editorNodeId, viewState);
          }
        }}
        nodeId={pdfViewContext.editorNodeId}
        persistedPageCount={resolvePersistedPdfPageCount(pdfDocumentSurface.details)}
        persistedPageDimensions={resolvePersistedPdfPageDimensions(pdfDocumentSurface.details)}
        pdfIndexStatus={pdfDocumentSurface.pdfIndexStatus}
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
