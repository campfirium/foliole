import { useEffect, useState } from 'react';

import type { PdfSearchDebugInfo, PdfSearchRequest, PdfSearchStatus, PdfSearchTarget, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import { PdfSearchDebugOverlay } from './PdfSearchDebugOverlay';

export function useSearchDebugOverlayState(
  searchQuery: string,
  searchRequest: PdfSearchRequest | null,
  searchStatus: PdfSearchStatus,
  searchTarget: PdfSearchTarget | null,
  searchHighlightCount: number
) {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (!searchQuery.trim()) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
  }, [searchQuery, searchRequest, searchStatus.current, searchStatus.total, searchTarget, searchHighlightCount]);
  return [isOpen, setIsOpen] as const;
}

interface PdfViewportSearchDebugOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  searchHighlights: PdfSearchVisualHighlight[];
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchStatus: PdfSearchStatus;
  searchTarget: PdfSearchTarget | null;
  searchDebug: PdfSearchDebugInfo;
}

export function PdfViewportSearchDebugOverlay(props: PdfViewportSearchDebugOverlayProps) {
  return (
    <PdfSearchDebugOverlay
      isOpen={props.isOpen}
      onClose={props.onClose}
      searchHighlights={props.searchHighlights}
      searchQuery={props.searchQuery}
      searchRequest={props.searchRequest}
      searchStatus={props.searchStatus}
      searchTarget={props.searchTarget}
      searchDebug={props.searchDebug}
    />
  );
}
