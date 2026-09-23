import type { MouseEvent as ReactMouseEvent } from 'react';
import { useRef, useState } from 'react';

import type { EditorSelection } from '@/features/editor/adapters/EditorAdapter';

export function useImmersiveReadableArticleState() {
  const [isChromeVisible, setIsChromeVisible] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isActionsSheetOpen, setIsActionsSheetOpen] = useState(false);
  const [isContentEditing, setIsContentEditing] = useState(false);
  const [isSearchSheetOpen, setIsSearchSheetOpen] = useState(false);
  const [openReadingSheet, setOpenReadingSheet] = useState<'font' | 'highlight' | 'info' | null>(null);
  const [readingTarget, setReadingTarget] = useState<{ selection: EditorSelection; commandId: string } | null>(null);
  const nextReadingCommandId = useRef(0);

  function handleSurfaceClick(event: ReactMouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) {
      return;
    }
    setIsChromeVisible((visible) => !visible);
  }

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
    handleSurfaceClick,
    isActionsSheetOpen,
    isChromeVisible,
    isContentEditing,
    isOutlineOpen,
    isSearchSheetOpen,
    openDocumentSearch,
    openReadingSheet,
    readingRestoreCommandId: readingTarget?.commandId ?? null,
    readingSelection: readingTarget?.selection ?? null,
    setIsActionsSheetOpen,
    setIsOutlineOpen,
    setIsSearchSheetOpen,
    setOpenReadingSheet
  };
}
