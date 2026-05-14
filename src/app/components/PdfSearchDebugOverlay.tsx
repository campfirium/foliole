import type { PdfSearchDebugInfo, PdfSearchRequest, PdfSearchStatus, PdfSearchTarget, PdfSearchVisualHighlight } from './PdfDocumentSearch';

interface PdfSearchDebugOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  searchHighlights: PdfSearchVisualHighlight[];
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchStatus: PdfSearchStatus;
  searchTarget: PdfSearchTarget | null;
  searchDebug: PdfSearchDebugInfo;
}

function resolveDebugPayload(props: Omit<PdfSearchDebugOverlayProps, 'isOpen' | 'onClose'>) {
  return {
    current: props.searchStatus.current,
    hasQuery: props.searchStatus.hasQuery,
    highlights: props.searchHighlights.map((item) => ({
      active: item.isActive,
      fragmentCount: item.fragments?.length ?? 1,
      id: item.id,
      page: item.page,
      rectCount: item.rects.length,
      x: item.x,
      y: item.y
    })),
    query: props.searchQuery,
    request: props.searchRequest,
    target: props.searchTarget,
    pages: props.searchDebug.pages,
    total: props.searchStatus.total
  };
}

export function PdfSearchDebugOverlay(props: PdfSearchDebugOverlayProps) {
  if (!props.isOpen) {
    return null;
  }
  const payload = resolveDebugPayload(props);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-debug w-[460px] max-w-[70vw] rounded-md border border-border bg-bg-panel/95 p-3 shadow-debug">
      <div className="pointer-events-auto mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Search debug</p>
        <button className="rounded px-2 py-1 text-xs text-foreground/70 hover:bg-bg-muted hover:text-foreground" onClick={props.onClose} type="button">
          Close
        </button>
      </div>
      <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-all text-[11px] leading-4 text-foreground/80">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}
