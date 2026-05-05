import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { usePdfSystemController } from '../../features/pdf/model/usePdfSystemController';
import { AppSelectionDropdownMenu, AppSelectionDropdownMenuItem } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';
import { normalizeContextMenuPosition } from '../contextCommands';

import { PdfDocumentViewport } from './PdfDocumentViewport';
import { resolvePdfSelectionText } from './pdfSelectionText';

function configurePdfWorker() {
  const workerUrl = new URL('react-pdf/dist/pdf.worker.entry.js', import.meta.url).toString();

  // Ensure a stale fake-worker instance from previous hot reloads cannot win over the current runtime.
  if ('pdfjsWorker' in globalThis) {
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'pdfjsWorker');
  }

  pdfjs.GlobalWorkerOptions.workerSrc = `${workerUrl}?v=${encodeURIComponent(pdfjs.version)}`;
}

configurePdfWorker();

interface PdfDocumentSurfaceProps {
  onCreateHighlightFromSelection?: (selectionText: string) => boolean;
  sourceHint: string;
  sourceLabel: string;
  nodeViewState?: NodeViewState;
  onViewStateChange: (viewState: NodeViewState) => void;
}

function usePdfSelectionContextMenu(onCreateHighlightFromSelection?: (selectionText: string) => boolean) {
  const [selectionMenuState, setSelectionMenuState] = useState<{ left: number; top: number; selectionText: string } | null>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const selectionText = resolvePdfSelectionText(surfaceRef.current, window.getSelection());
    if (!selectionText) {
      setSelectionMenuState(null);
      return;
    }
    event.preventDefault();
    const position = normalizeContextMenuPosition(event.clientX, event.clientY);
    setSelectionMenuState({
      left: position.left,
      top: position.top,
      selectionText
    });
  };

  const closeSelectionMenu = () => {
    setSelectionMenuState(null);
  };

  const handleCreateHighlight = () => {
    if (!selectionMenuState?.selectionText) {
      closeSelectionMenu();
      return;
    }
    onCreateHighlightFromSelection?.(selectionMenuState.selectionText);
    closeSelectionMenu();
  };

  return {
    closeSelectionMenu,
    handleContextMenu,
    handleCreateHighlight,
    selectionMenuState,
    surfaceRef
  };
}

function PdfSelectionContextMenu({
  onClose,
  onCreateHighlight,
  state
}: {
  onClose: () => void;
  onCreateHighlight: () => void;
  state: { left: number; top: number } | null;
}) {
  if (!state) {
    return null;
  }

  return (
    <AppSelectionDropdownMenu left={state.left} onClose={onClose} top={state.top}>
      <AppSelectionDropdownMenuItem onClick={onCreateHighlight}>Highlight</AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );
}

export function PdfDocumentSurface({ nodeViewState, onCreateHighlightFromSelection, onViewStateChange, sourceHint }: PdfDocumentSurfaceProps) {
  const {
    actions: {
      clearPageJumpRequest,
      reportLoadError,
      reportLoadSuccess,
      requestPageChange,
      rotateClockwise,
      setVisiblePage,
      stepPage,
      zoomIn,
      zoomOut
    },
    state: { loadError, maxPage, page, pageJumpRequest, pdfSource, rotation, totalPages, zoom }
  } = usePdfSystemController(nodeViewState, onViewStateChange, sourceHint);
  const { closeSelectionMenu, handleContextMenu, handleCreateHighlight, selectionMenuState, surfaceRef } = usePdfSelectionContextMenu(
    onCreateHighlightFromSelection
  );

  return (
    <section
      aria-label="PDF reader panel"
      className="pdf-document-surface relative flex min-h-0 flex-1 flex-col bg-bg-canvas"
      data-testid="pdf-document-surface"
      ref={surfaceRef}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <PdfDocumentViewport
          loadError={loadError}
          maxPage={maxPage}
          onContextMenu={handleContextMenu}
          onNextPage={() => stepPage(1)}
          onLoadError={(message) => reportLoadError(message)}
          onLoadSuccess={(numPages) => {
            reportLoadSuccess(numPages);
          }}
          onPageChange={requestPageChange}
          onPreviousPage={() => stepPage(-1)}
          onRotateClockwise={rotateClockwise}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          page={page}
          pageJumpRequest={pageJumpRequest}
          pdfSource={pdfSource}
          rotation={rotation}
          clearPageJumpRequest={clearPageJumpRequest}
          setVisiblePage={setVisiblePage}
          totalPages={totalPages}
          zoom={zoom}
        />
      </div>
      <PdfSelectionContextMenu onClose={closeSelectionMenu} onCreateHighlight={handleCreateHighlight} state={selectionMenuState} />
    </section>
  );
}
