import type { PdfSearchStatus } from './PdfDocumentSearch';
import { PdfPageControls, PdfSearchControls, PdfZoomControls } from './PdfDocumentToolbarControls';

interface PdfDocumentToolbarProps {
  isVisible: boolean;
  maxPage: number;
  onClearSearch: () => void;
  onFindNext: () => void;
  onFindPrevious: () => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchFocusChange: (focused: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onSetZoom: (value: number) => void;
  onToolbarActiveChange: (active: boolean) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  searchIndexingHint: string | null;
  searchQuery: string;
  searchStatus: PdfSearchStatus;
  zoom: number;
}

function resolveToolbarShellClassName() {
  return 'sticky top-0 z-20 h-0 w-full px-4 pt-3 pointer-events-none';
}

function resolveToolbarPanelClassName(isVisible: boolean) {
  const visibilityClassName = isVisible ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0 pointer-events-none';
  return `pointer-events-auto absolute left-1/2 top-3 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-4 rounded-full border border-border bg-bg-elevated px-4 py-2 shadow-sm transition-[opacity,transform] duration-200 ease-out ${visibilityClassName}`;
}

function ToolbarDivider() {
  return <div className="h-5 w-px bg-border/30" />;
}

export function PdfDocumentToolbar(props: PdfDocumentToolbarProps) {
  return (
    <div className={resolveToolbarShellClassName()} data-testid="pdf-document-toolbar" data-toolbar-visible={props.isVisible ? 'true' : 'false'}>
      <div
        className={resolveToolbarPanelClassName(props.isVisible)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            props.onToolbarActiveChange(false);
          }
        }}
        onFocusCapture={() => props.onToolbarActiveChange(true)}
        onMouseEnter={() => props.onToolbarActiveChange(true)}
        onMouseLeave={() => props.onToolbarActiveChange(false)}
      >
        <PdfZoomControls
          onRotateClockwise={props.onRotateClockwise}
          onSetZoom={props.onSetZoom}
          onToolbarInteraction={props.onToolbarInteraction}
          onZoomIn={props.onZoomIn}
          onZoomOut={props.onZoomOut}
          zoom={props.zoom}
        />
        <ToolbarDivider />
        <PdfPageControls
          maxPage={props.maxPage}
          onNextPage={props.onNextPage}
          onPageChange={props.onPageChange}
          onPreviousPage={props.onPreviousPage}
          onToolbarInteraction={props.onToolbarInteraction}
          page={props.page}
        />
        <ToolbarDivider />
        <PdfSearchControls
          onClearSearch={props.onClearSearch}
          onFindNext={props.onFindNext}
          onFindPrevious={props.onFindPrevious}
          onSearchFocusChange={props.onSearchFocusChange}
          onSearchQueryChange={props.onSearchQueryChange}
          onToolbarInteraction={props.onToolbarInteraction}
          searchIndexingHint={props.searchIndexingHint}
          searchQuery={props.searchQuery}
          searchStatus={props.searchStatus}
        />
      </div>
    </div>
  );
}
