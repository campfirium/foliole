import type { MouseEvent as ReactMouseEvent } from 'react';
import { useState } from 'react';

import type { EditorSelection } from '@/features/editor/adapters/EditorAdapter';

export function useImmersiveReadableArticleState(closeSelectionToolbar: () => void) {
  const [isChromeVisible, setIsChromeVisible] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isActionsSheetOpen, setIsActionsSheetOpen] = useState(false);
  const [isSearchSheetOpen, setIsSearchSheetOpen] = useState(false);
  const [openReadingSheet, setOpenReadingSheet] = useState<'font' | 'highlight' | 'info' | null>(null);
  const [readingSelection, setReadingSelection] = useState<EditorSelection | null>(null);

  function handleSurfaceClick(event: ReactMouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) {
      return;
    }
    setIsChromeVisible(true);
  }

  function handleSelectOutlineItem(item: { from: number; to: number }) {
    setReadingSelection({ from: item.from, to: item.to });
    closeSelectionToolbar();
    setIsOutlineOpen(false);
  }

  function openDocumentSearch() {
    setIsActionsSheetOpen(false);
    setIsSearchSheetOpen(true);
  }

  return {
    handleSelectOutlineItem,
    handleSurfaceClick,
    isActionsSheetOpen,
    isChromeVisible,
    isOutlineOpen,
    isSearchSheetOpen,
    openDocumentSearch,
    openReadingSheet,
    readingSelection,
    setIsActionsSheetOpen,
    setIsOutlineOpen,
    setIsSearchSheetOpen,
    setOpenReadingSheet
  };
}
