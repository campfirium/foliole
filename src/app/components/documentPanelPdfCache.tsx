import type { ComponentProps } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { resolvePdfDocumentSurface } from './documentPanelPdfView';
import { PdfDocumentSurfaceCache } from './PdfDocumentSurfaceCache';
import type { collectPdfHighlightLocators } from './pdfHighlightLocators';
import { ReadwiseBookActionsPanel } from './ReadwiseBookActionsPanel';

export function createDocumentPanelPdfCache(args: {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  pdfDocumentSurface: ReturnType<typeof resolvePdfDocumentSurface>;
  pdfHighlightLocators: ReturnType<typeof collectPdfHighlightLocators>;
  setIsActivePdfCachedVisible: (visible: boolean) => void;
}) {
  const activePersistedPageDimensions =
    args.pdfDocumentSurface?.state === 'ready'
      ? Object.fromEntries(args.pdfDocumentSurface.details.pdfPageDimensions.flatMap(getPersistedPageDimensionEntry))
      : {};
  return (
    <>
      <PdfDocumentSurfaceCache
        activeNodeId={args.activeNodeId}
        activePersistedPageCount={getActivePersistedPageCount(args.pdfDocumentSurface)}
        activePersistedPageDimensions={activePersistedPageDimensions}
        activePdfState={args.pdfDocumentSurface?.state ?? null}
        activeSourceHint={args.pdfDocumentSurface?.sourceHint ?? null}
        editorNodeId={args.bodyProps.editorNodeId}
        editorNodeViewState={args.bodyProps.editorNodeViewState}
        highlightLocators={args.pdfHighlightLocators}
        onActiveCacheVisibilityChange={args.setIsActivePdfCachedVisible}
        onCreatePdfHighlight={args.onCreatePdfHighlight}
        onPersistPdfViewState={args.onPersistPdfViewState}
      />
      <ReadwiseBookActionsPanel activeNodeId={args.activeNodeId} />
    </>
  );
}

function getActivePersistedPageCount(pdfDocumentSurface: ReturnType<typeof resolvePdfDocumentSurface>) {
  if (pdfDocumentSurface?.state !== 'ready') {
    return null;
  }
  return pdfDocumentSurface.details.pdfPageDimensions.reduce((maxPage, entry) => Math.max(maxPage, entry.page), 0) || null;
}

function getPersistedPageDimensionEntry(entry: {
  page: number;
  pageHeight?: number | null;
  pageWidth?: number | null;
}) {
  if (
    typeof entry.pageWidth === 'number' &&
    Number.isFinite(entry.pageWidth) &&
    entry.pageWidth > 0 &&
    typeof entry.pageHeight === 'number' &&
    Number.isFinite(entry.pageHeight) &&
    entry.pageHeight > 0
  ) {
    return [[entry.page, { height: entry.pageHeight, width: entry.pageWidth }] as const];
  }
  return [];
}
