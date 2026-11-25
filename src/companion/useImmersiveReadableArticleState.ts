import { useRef, useState } from 'react';

import { useCompanionReadingArticleView } from './CompanionReadingSession';
import { useImmersiveReadingSurfaceTap } from './useImmersiveReadingSurfaceTap';

import type { EditorSelection } from '@/features/editor/adapters/EditorAdapter';

export function useImmersiveReadableArticleState(initialSelection: EditorSelection | null = null, initialCommandId = 'companion-search-match') {
  const { chromeVisible: isChromeVisible, editing: isContentEditing, outlineOpen: isOutlineOpen,
    setChromeVisible: setIsChromeVisible, setEditing: setIsContentEditing, setOutlineOpen: setIsOutlineOpen } = useCompanionReadingArticleView();
  const [isActionsSheetOpen, setIsActionsSheetOpen] = useState(false);
  const [isSearchSheetOpen, setIsSearchSheetOpen] = useState(false);
  const [openReadingSheet, setOpenReadingSheet] = useState<'font' | null>(null);
  const [readingTarget, setReadingTarget] = useState<{ selection: EditorSelection; commandId: string } | null>(null);
  const nextReadingCommandId = useRef(0);

  const surfaceTap = useImmersiveReadingSurfaceTap(isContentEditing, setIsChromeVisible);

  function handleSelectOutlineItem(item: { from: number; to: number }) {
    nextReadingCommandId.current += 1;
    setReadingTarget({
      selection: { from: item.from, to: item.to },
      commandId: `companion-reading-${nextReadingCommandId.current}`
    });
    setIsOutlineOpen(false);
  }

  function openDocumentSearch() {
    setIsActionsSheetOpen(false);
    setIsSearchSheetOpen(true);
  }

  function enterContentEditing() {
    setIsActionsSheetOpen(false);
    setOpenReadingSheet(null);
    setIsChromeVisible(true);
    setIsContentEditing(true);
  }

  function exitContentEditing() {
    setIsContentEditing(false);
  }

  return {
    enterContentEditing,
    exitContentEditing,
    handleSelectOutlineItem,
    ...surfaceTap,
    isActionsSheetOpen,
    isChromeVisible,
    isContentEditing,
    isOutlineOpen,
    isSearchSheetOpen,
    openDocumentSearch,
    openReadingSheet,
    readingRestoreCommandId: readingTarget?.commandId ?? (initialSelection ? initialCommandId : null),
    readingSelection: readingTarget?.selection ?? initialSelection,
    setIsActionsSheetOpen,
    setIsOutlineOpen,
    setIsSearchSheetOpen,
    setOpenReadingSheet
  };
}
