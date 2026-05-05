import { AppButton, AppInput } from '../../shared/ui';

interface PdfDocumentToolbarProps {
  maxPage: number;
  onPageChange: (value: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  zoom: number;
}

function PdfPageControls({ maxPage, onPageChange, page }: Pick<PdfDocumentToolbarProps, 'maxPage' | 'onPageChange' | 'page'>) {
  const pageCountLabel = Number.isFinite(maxPage) ? maxPage : '--';

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="pdf-page-input">
        PDF page
      </label>
      <AppInput
        aria-label="PDF page"
        className="h-8 w-14 border-transparent bg-transparent px-2 text-center text-sm"
        id="pdf-page-input"
        min={1}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (!Number.isFinite(value)) {
            return;
          }
          onPageChange(value);
        }}
        type="number"
        value={page}
      />
      <p className="min-w-16 text-xs text-foreground/55" data-testid="pdf-page-count">
        / {pageCountLabel}
      </p>
    </div>
  );
}

function PdfZoomControls({ onZoomIn, onZoomOut, zoom }: Pick<PdfDocumentToolbarProps, 'onZoomIn' | 'onZoomOut' | 'zoom'>) {
  return (
    <div className="flex items-center gap-1">
      <AppButton aria-label="Zoom out" onClick={onZoomOut} size="sm" variant="ghost">
        -
      </AppButton>
      <p aria-live="polite" className="min-w-14 text-center text-xs text-foreground/70" data-testid="pdf-zoom-value">
        {zoom}%
      </p>
      <AppButton aria-label="Zoom in" onClick={onZoomIn} size="sm" variant="ghost">
        +
      </AppButton>
    </div>
  );
}

export function PdfDocumentToolbar({
  maxPage,
  onPageChange,
  onZoomIn,
  onZoomOut,
  page,
  zoom
}: PdfDocumentToolbarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4" data-testid="pdf-document-toolbar">
      <div className="pointer-events-auto flex items-center gap-4 rounded-full bg-gradient-to-b from-bg-elevated/96 via-bg-elevated/82 to-bg-elevated/58 px-4 py-2 shadow-sm backdrop-blur">
        <div className="flex items-center gap-1">
          <PdfZoomControls onZoomIn={onZoomIn} onZoomOut={onZoomOut} zoom={zoom} />
        </div>
        <div className="h-5 w-px bg-border/30" />
        <PdfPageControls maxPage={maxPage} onPageChange={onPageChange} page={page} />
      </div>
    </div>
  );
}
