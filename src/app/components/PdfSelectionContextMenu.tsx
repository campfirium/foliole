import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import type { PdfAnchorLocator } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppSelectionDropdownMenu, AppSelectionDropdownMenuItem } from '../../shared/ui';
import { normalizeContextMenuPosition } from '../contextCommands';

import { resolveContextMenuSelection, useTrackPdfSelection, type PdfSelectionSnapshot } from './pdfSelectionRuntime';

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
  useTrackPdfSelection(surfaceRef, preservedSelectionRef);

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const fallbackSelection = resolveContextMenuSelection(surfaceRef.current, preservedSelectionRef.current);
    if (!fallbackSelection?.selectionText) {
      setSelectionMenuState(null);
      setSelectionOverlayLocator(undefined);
      return;
    }
    event.preventDefault();
    const position = normalizeContextMenuPosition(event.clientX, event.clientY);
    setSelectionMenuState({
      left: position.left,
      locator: fallbackSelection.locator,
      selectionText: fallbackSelection.selectionText,
      top: position.top
    });
    setSelectionOverlayLocator(fallbackSelection.locator);
  };

  const closeSelectionMenu = () => {
    setSelectionMenuState(null);
    setSelectionOverlayLocator(undefined);
  };

  const handleCreateHighlight = () => {
    if (!selectionMenuState?.selectionText) {
      closeSelectionMenu();
      return;
    }
    onCreateHighlightFromSelection?.(selectionMenuState.selectionText, selectionMenuState.locator);
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
  onClose,
  onCreateHighlight,
  state
}: {
  onClose: () => void;
  onCreateHighlight: () => void;
  state: { left: number; top: number } | null;
}) {
  const t = useTranslation();
  if (!state) {
    return null;
  }

  return (
    <AppSelectionDropdownMenu left={state.left} onClose={onClose} top={state.top}>
      <AppSelectionDropdownMenuItem onClick={onCreateHighlight}>
        {t('desktop.pdf.selection.highlight')}
      </AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );
}
