import { useCallback, useState } from 'react';

import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import type { CompanionTopicSearchResult } from '../shared/platform/companionFullTextSearch';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';

import { useCompanionNavigationField } from './CompanionNavigationProvider';
import type { CompanionSearchMatch } from './companionSearchMatch';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

export function useCompanionSearchNavigation(surface: ReturnType<typeof useCompanionArticleSurface>) {
  const [searchMatch, setSearchMatch] = useState<CompanionSearchMatch | null>(null);
  const [topicNodeId, setTopicNodeId] = useCompanionNavigationField('searchTopicNodeId', null);
  const { externalDocument, setExternalDocument, pdfResult, setPdfResult } = useSearchDocumentResume();
  const clearLocalResult = useCallback(() => {
    setExternalDocument(null);
    setPdfResult(null);
  }, [setExternalDocument, setPdfResult]);
  const openTopic = useCallback((result: CompanionTopicSearchResult, query: string) => {
    const nodeId = result.nodeId;
    setSearchMatch({ matchStart: result.matchStart, query });
    clearLocalResult();
    setTopicNodeId(nodeId);
    surface.handleSelectBrowseNode(nodeId);
  }, [clearLocalResult, surface]);
  const openExternalDocument = useCallback((document: CompanionExternalDocumentSearchResult, query: string) => {
    setSearchMatch({ matchStart: document.match_start, query });
    setTopicNodeId(null);
    setPdfResult(null);
    setExternalDocument(document);
  }, [setExternalDocument, setPdfResult, setTopicNodeId]);
  const openPdf = useCallback((result: CompanionPdfPageTextSearchResult) => {
    setTopicNodeId(null);
    setExternalDocument(null);
    setPdfResult(result);
  }, [setExternalDocument, setPdfResult, setTopicNodeId]);
  const exitTopic = useCallback(() => {
    setTopicNodeId(null);
    surface.handleExitSearchArticle();
  }, [surface]);
  const isTopicOpen = Boolean(
    topicNodeId && surface.selectedBrowseNodeId === topicNodeId
  );
  return {
    exitExternalDocument: () => setExternalDocument(null),
    exitPdf: () => setPdfResult(null),
    exitTopic,
    externalDocument,
    isTopicOpen,
    openExternalDocument,
    openPdf,
    openTopic,
    pdfResult,
    searchMatch
  };
}

function useSearchDocumentResume() {
  const [externalId, setExternalId] = useCompanionNavigationField('searchExternalDocumentId', null);
  const [savedPdf, setSavedPdf] = useCompanionNavigationField('searchPdf', null);
  const [, setPdfPositions] = useCompanionNavigationField('pdfPositionById', {});
  const externalDocument = externalId ? { document_id: externalId } : null;
  const setExternalDocument = useCallback((document: Pick<CompanionExternalDocumentSearchResult, 'document_id'> | null) => {
    setExternalId(document?.document_id ?? null);
  }, [setExternalId]);
  const pdfResult = savedPdf;
  const setPdfResult = useCallback((value: Pick<CompanionPdfPageTextSearchResult, 'attachment_id' | 'page'> | null) => {
    if (value) setPdfPositions(current => {
      const next = { ...current };
      delete next[value.attachment_id];
      return next;
    });
    setSavedPdf(value ? { attachment_id: value.attachment_id, page: value.page } : null);
  }, [setSavedPdf, setPdfPositions]);
  return { externalDocument, setExternalDocument, pdfResult, setPdfResult };
}
