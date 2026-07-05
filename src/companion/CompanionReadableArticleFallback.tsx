import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';
import { CompanionReviewFallback } from './CompanionReviewFallback';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
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
        onSaveContent={createCompanionTopicContentSaveHandler(props.workspaceSync)}
        readableArticle={props.surface.readableArticle}
        readingTypographySettings={DEFAULT_READING_TYPOGRAPHY_SETTINGS}
        syncEndpointUrl={resolveCompanionWorkspaceSyncEndpoint(props.workspaceSync.state)}
      />
    );
  }
  return <CompanionReviewFallback error={props.error} hasSnapshot={props.hasSnapshot} reviewSession={props.surface.reviewSession} />;
}
