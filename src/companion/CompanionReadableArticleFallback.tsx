import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';
import { CompanionReviewFallback } from './CompanionReviewFallback';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

import { definedProps } from '@/shared/lib/definedProps';
import { supportsCompanionNodeMutation } from '@/shared/platform/companionWorkspaceRuntimeRepository';

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
    const onSaveContent = supportsCompanionNodeMutation()
      ? createCompanionTopicContentSaveHandler(props.workspaceSync)
      : undefined;
    return (
      <ReadableArticleDocument
        onAttachmentResourceSynced={props.onAttachmentResourceSynced}
        readableArticle={props.surface.readableArticle}
        readingTypographySettings={DEFAULT_READING_TYPOGRAPHY_SETTINGS}
        syncEndpointUrl={resolveCompanionWorkspaceSyncEndpoint(props.workspaceSync.state)}
        {...definedProps({ onSaveContent })}
      />
    );
  }
  return <CompanionReviewFallback error={props.error} hasSnapshot={props.hasSnapshot} reviewSession={props.surface.reviewSession} />;
}
