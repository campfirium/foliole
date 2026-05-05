import { useRef, useState } from 'react';

import type { PdfSearchRequest, PdfSearchStatus } from './PdfDocumentSearch';

export function usePdfSearchControls() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRequest, setSearchRequest] = useState<PdfSearchRequest | null>(null);
  const [searchTarget, setSearchTarget] = useState<{ id: number; matchStart: number; page: number } | null>(null);
  const [searchStatus, setSearchStatus] = useState<PdfSearchStatus>({ current: 0, hasQuery: false, total: 0 });
  const searchRequestIdRef = useRef(1);
  const searchTargetIdRef = useRef(1);

  const handleSearchRequest = (direction: 'next' | 'previous') => {
    setSearchRequest({ direction, id: searchRequestIdRef.current });
    searchRequestIdRef.current += 1;
  };

  const applyExternalSearch = (request: { matchStart: number; page: number; query: string }) => {
    setSearchQuery(request.query);
    setSearchTarget({
      id: searchTargetIdRef.current,
      matchStart: request.matchStart,
      page: request.page
    });
    searchTargetIdRef.current += 1;
  };

  return {
    applyExternalSearch,
    handleSearchRequest,
    searchQuery,
    searchRequest,
    searchStatus,
    searchTarget,
    setSearchQuery,
    setSearchStatus
  };
}
