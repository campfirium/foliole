import { Highlighter } from 'lucide-react';
import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

import type { PdfAnchorLocator } from '../../features/nodes/model/nodeTypes';
import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName } from '../../shared/ui';
import { normalizeContextMenuPosition } from '../contextCommands';

import { AnnotationToolbarButton } from './AnnotationToolbarButton';
import { resolveContextMenuSelection, useTrackPdfSelection, type PdfSelectionSnapshot } from './pdfSelectionRuntime';
import { usePdfSelectionToolbar } from './usePdfSelectionToolbar';

export function usePdfSelectionContextMenu(onCreateHighlightFromSelection?: (selectionText: string, locator: PdfAnchorLocator) => boolean) {
  const [selectionMenuState, setSelectionMenuState] = useState<{
    left: number;
    locator: PdfAnchorLocator;
    selectionText: string;
    top: number;
  } | null>(null);
  const [selectionOverlayLocator, setSelectionOverlayLocator] = useState<PdfAnchorLocator | undefined>(undefined);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const preservedSelectionRef = useRef<PdfSelectionSnapshot | null>(null);
  const closeSelectionMenu = () => {
    setSelectionMenuState(null);
    setSelectionOverlayLocator(undefined);
  };
  const openSelectionToolbar = (
    selection: PdfSelectionSnapshot,
    position: { left: number; top: number },
    showOverlay = false
  ) => {
    setSelectionMenuState({ ...position, locator: selection.locator, selectionText: selection.selectionText });
    setSelectionOverlayLocator(showOverlay ? selection.locator : undefined);
  };
  useTrackPdfSelection(surfaceRef, preservedSelectionRef);
  usePdfSelectionToolbar({ onClose: closeSelectionMenu, onOpen: openSelectionToolbar, surfaceRef });

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const fallbackSelection = resolveContextMenuSelection(surfaceRef.current, preservedSelectionRef.current);
    if (!fallbackSelection?.selectionText) {
      setSelectionMenuState(null);
      setSelectionOverlayLocator(undefined);
      return;
    }
    event.preventDefault();
    const position = normalizeContextMenuPosition(event.clientX, event.clientY);
    openSelectionToolbar(fallbackSelection, position, true);
  };

  const handleCreateHighlight = () => {
    if (!selectionMenuState?.selectionText) {
      closeSelectionMenu();
      return;
    }
    const created = onCreateHighlightFromSelection?.(selectionMenuState.selectionText, selectionMenuState.locator) ?? false;
    if (created) {
      window.getSelection()?.removeAllRanges();
      preservedSelectionRef.current = null;
    }
    closeSelectionMenu();
  };

  return {
    closeSelectionMenu,
    handleContextMenu,
    handleCreateHighlight,
    selectionMenuState,
    selectionOverlayLocator,
    surfaceRef
  };
}

export function PdfSelectionContextMenu({
  onCreateHighlight,
  state
}: {
  onCreateHighlight: () => void;
  state: { left: number; top: number } | null;
}) {
  const t = useTranslation();
  if (!state) {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-floating"
      data-annotation-toolbar="true"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left: state.left, top: state.top }}
    >
      <div className={cn(appFloatingSurfaceClassName('popover'), 'flex items-center gap-1 px-1.5 py-1')} role="toolbar" style={{ opacity: 'var(--app-selection-toolbar-opacity)' }}>
        <AnnotationToolbarButton label={t('desktop.pdf.selection.highlight')} onClick={onCreateHighlight}>
          <Highlighter aria-hidden="true" size={19} strokeWidth={2} />
        </AnnotationToolbarButton>
      </div>
    </div>,
    document.body
  );
}
