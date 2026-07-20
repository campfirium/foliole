import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';

import { CompanionSearchContent } from './CompanionSearchContent';
import { CompanionSearchExternalArticle } from './CompanionSearchExternalArticle';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type Surface = ReturnType<typeof useCompanionArticleSurface>;
type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

export function renderCompanionShellSearchSurface(props: {
  externalDocument: CompanionExternalDocumentSearchResult | null;
  isTopicOpen: boolean;
  onExitExternalDocument(): void;
  onExitTopic(): void;
  onOpenExternalDocument(document: CompanionExternalDocumentSearchResult): void;
  onOpenTopic(nodeId: string): void;
  surface: Surface;
  workspaceSync: WorkspaceSync;
}) {
  const isSearchSurfaceOpen = Boolean(props.externalDocument) || props.isTopicOpen || props.surface.activeAction === 'search';
  if (!isSearchSurfaceOpen) return null;
  return (
    <>
      <CompanionSearchContent
        onOpenExternalDocument={props.onOpenExternalDocument}
        onOpenTopic={props.onOpenTopic}
      />
      {props.externalDocument ? (
        <CompanionSearchExternalArticle document={props.externalDocument} onExit={props.onExitExternalDocument} />
      ) : null}
      {props.isTopicOpen ? (
        <CompanionShellReadableArticle onExit={props.onExitTopic} surface={props.surface} workspaceSync={props.workspaceSync} />
      ) : null}
    </>
  );
}
