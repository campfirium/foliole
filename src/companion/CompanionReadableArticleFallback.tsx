import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { CompanionReviewFallback } from './CompanionReviewFallback';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type Surface = ReturnType<typeof useCompanionArticleSurface>;
type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

export function ReadableArticleOrFallback(props: {
  error: string | null;
  hasSnapshot: boolean;
  onAttachmentResourceSynced(): void;
  surface: Surface;
  workspaceSync: WorkspaceSync;
}) {
  if (props.surface.readableArticle) {
    return (
      <ReadableArticleDocument
        onAttachmentResourceSynced={props.onAttachmentResourceSynced}
        readableArticle={props.surface.readableArticle}
        syncEndpointUrl={resolveCompanionWorkspaceSyncEndpoint(props.workspaceSync.state)}
      />
    );
  }
  return <CompanionReviewFallback error={props.error} hasSnapshot={props.hasSnapshot} reviewSession={props.surface.reviewSession} />;
}
