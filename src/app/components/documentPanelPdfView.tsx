import type { ComponentProps } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';
import { AppEmptyState } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { PdfDocumentSurface } from './PdfDocumentSurface';
import type { PdfHighlightLocator } from './pdfHighlightLocators';

export type PdfDocumentSurfaceState = 'empty' | 'failed' | 'loading' | 'ready';

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

export function resolvePdfDocumentSurface(
  isLoading: boolean,
  details: RuntimeNodeSourceDetails | null
): { sourceHint: string | null; state: PdfDocumentSurfaceState } | null {
  if (!isPdfSourceDetails(details) || !details || details.inheritedFromParent) {
    return null;
  }

  const sourceHint = resolvePdfSourceHint(details);
  if (details.keepImportItem?.lastStatus === 'failed') {
    return { sourceHint, state: 'failed' };
  }
  if (!sourceHint) {
    return { sourceHint: sourceHint ?? null, state: isLoading ? 'loading' : 'empty' };
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

export function renderPdfDocumentSurface(
  pdfDocumentSurface: { sourceHint: string | null; state: PdfDocumentSurfaceState },
  pdfViewContext: {
    editorNodeId: string | null;
    editorNodeViewState: ComponentProps<typeof DocumentPanelBody>['editorNodeViewState'];
  },
  highlightLocators: PdfHighlightLocator[],
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean,
  onPersistPdfViewState: (viewState: NodeViewState) => void
) {
  if (pdfDocumentSurface.state === 'ready') {
    return (
      <PdfDocumentSurface
        highlightLocators={highlightLocators}
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
