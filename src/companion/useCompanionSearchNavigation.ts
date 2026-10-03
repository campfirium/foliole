import { useCallback, useState } from 'react';

import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import type { CompanionTopicSearchResult } from '../shared/platform/companionFullTextSearch';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';

import type { CompanionSearchMatch } from './companionSearchMatch';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

export function useCompanionSearchNavigation(surface: ReturnType<typeof useCompanionArticleSurface>) {
  const [searchMatch, setSearchMatch] = useState<CompanionSearchMatch | null>(null);
  const [topicNodeId, setTopicNodeId] = useState<string | null>(null);
  const [externalDocument, setExternalDocument] = useState<CompanionExternalDocumentSearchResult | null>(null);
  const [pdfResult, setPdfResult] = useState<CompanionPdfPageTextSearchResult | null>(null);
  const clearLocalResult = useCallback(() => {
    setExternalDocument(null);
    setPdfResult(null);
  }, []);
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
  }, []);
  const openPdf = useCallback((result: CompanionPdfPageTextSearchResult) => {
    setTopicNodeId(null);
    setExternalDocument(null);
    setPdfResult(result);
  }, []);
  const exitTopic = useCallback(() => {
    setTopicNodeId(null);
    surface.handleExitSearchArticle();
  }, [surface]);
  const isTopicOpen = Boolean(
    topicNodeId && surface.selectedBrowseNodeId === topicNodeId && surface.readableArticle?.nodeId === topicNodeId
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
