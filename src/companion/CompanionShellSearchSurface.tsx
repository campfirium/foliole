import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';

import { CompanionSearchContent } from './CompanionSearchContent';
import { CompanionSearchExternalArticle } from './CompanionSearchExternalArticle';
import { CompanionSearchPdfDocument } from './CompanionSearchPdfDocument';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type Surface = ReturnType<typeof useCompanionArticleSurface>;
type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

export type CompanionShellSearchRouteProps = {
  isSearchArticleOpen: boolean;
  onExitSearchArticle(): void;
  onExitSearchExternalDocument(): void;
  onExitSearchPdf(): void;
  onOpenSearchExternalDocument(document: CompanionExternalDocumentSearchResult): void;
  onOpenSearchPdf(result: CompanionPdfPageTextSearchResult): void;
  onOpenSearchTopic(nodeId: string): void;
  searchExternalDocument: CompanionExternalDocumentSearchResult | null;
  searchPdfResult: CompanionPdfPageTextSearchResult | null;
};

export function renderCompanionShellSearchSurface(props: {
  externalDocument: CompanionExternalDocumentSearchResult | null;
  pdfResult: CompanionPdfPageTextSearchResult | null;
  isTopicOpen: boolean;
  onExitExternalDocument(): void;
  onExitPdf(): void;
  onExitTopic(): void;
  onOpenExternalDocument(document: CompanionExternalDocumentSearchResult): void;
  onOpenPdf(result: CompanionPdfPageTextSearchResult): void;
  onOpenTopic(nodeId: string): void;
  surface: Surface;
  workspaceSync: WorkspaceSync;
}) {
  const isSearchSurfaceOpen = Boolean(props.externalDocument || props.pdfResult) || props.isTopicOpen || props.surface.activeAction === 'search';
  if (!isSearchSurfaceOpen) return null;
  return (
    <>
      <CompanionSearchContent
        onOpenExternalDocument={props.onOpenExternalDocument}
        onOpenPdf={props.onOpenPdf}
        onOpenTopic={props.onOpenTopic}
      />
      {props.externalDocument ? (
        <CompanionSearchExternalArticle document={props.externalDocument} onExit={props.onExitExternalDocument} />
      ) : null}
      {props.pdfResult ? (
        <CompanionSearchPdfDocument
          onExit={props.onExitPdf}
          result={props.pdfResult}
          syncEndpointUrl={resolveCompanionWorkspaceSyncEndpoint(props.workspaceSync.state)}
        />
      ) : null}
      {props.isTopicOpen ? (
        <CompanionShellReadableArticle onExit={props.onExitTopic} surface={props.surface} workspaceSync={props.workspaceSync} />
      ) : null}
    </>
  );
}
