import { lazy, Suspense, type ComponentProps } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import { AppEmptyState, AppSpinner } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import type { PdfHighlightLocator } from './pdfHighlightLocators';
import type { PdfPageDimensions } from './pdfPageDimensions';

export type PdfDocumentSurfaceState = 'empty' | 'failed' | 'loading' | 'ready';
type PdfIndexStatus = 'failed' | 'indexing' | 'pending' | 'ready' | null;

const PdfDocumentSurface = lazy(() =>
  import('./PdfDocumentSurface').then((module) => ({ default: module.PdfDocumentSurface }))
);

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
  if (details.importSource?.sourceKind.toLowerCase() === 'pdf') {
    return details.importSource.sourceLocator || null;
  }
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

function renderPdfStateSurface(state: Exclude<PdfDocumentSurfaceState, 'ready'>, t: Translate) {
  if (state === 'loading') {
    return (
      <div data-testid="pdf-document-state-loading">
        <div aria-busy="true" className="flex min-h-[120px] items-center justify-center" role="status">
          <AppSpinner decorative />
        </div>
      </div>
    );
  }
  if (state === 'failed') {
    return (
      <div data-testid="pdf-document-state-failed">
        <AppEmptyState
          description={t('desktop.pdf.failed.description')}
          title={t('desktop.pdf.failed.title')}
        />
      </div>
    );
  }
  return (
    <div data-testid="pdf-document-state-empty">
      <AppEmptyState description={t('desktop.pdf.linkMissing.description')} title={t('desktop.pdf.linkMissing.title')} />
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
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void,
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void,
  t: Translate
) {
  if (pdfDocumentSurface.state === 'ready') {
    return (
      <Suspense fallback={renderPdfStateSurface('loading', t)}>
        <PdfDocumentSurface
          highlightLocators={highlightLocators}
          isVisible
          onCreateHighlightFromSelection={onCreatePdfHighlight}
          onOpenExternalLink={onOpenExternalLink}
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
          {...definedProps({ nodeViewState: pdfViewContext.editorNodeViewState })}
        />
      </Suspense>
    );
  }

  return (
    <section aria-label={t('desktop.pdf.readerPanel')} className="workspace-region-main-document flex min-h-0 flex-1 flex-col" data-testid="pdf-document-surface">
      <div className="mx-auto flex min-h-0 w-full max-w-[var(--document-max-width)] flex-1 flex-col px-6 py-5 max-[1080px]:px-4">
        <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-xl border border-border bg-bg-elevated px-6 py-8 shadow-page">
          {renderPdfStateSurface(pdfDocumentSurface.state, t)}
        </div>
      </div>
    </section>
  );
}
