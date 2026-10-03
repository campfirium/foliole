import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { ReviewBreadcrumb } from './CompanionReviewBreadcrumb';
import { useReviewBreadcrumbItems } from './companionReviewBreadcrumbs';
import type { CompanionSearchMatch } from './companionSearchMatch';
import {
  createCompanionExistingHighlightDeleteHandler,
  createCompanionExistingHighlightNoteHandler,
  createCompanionSelectionAnnotationHandler
} from './companionSelectionAnnotationController';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import { createCompanionTrashRestoreHandler } from './companionTrashController';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

import { supportsCompanionNodeMutationSurface } from '@/shared/platform/companionWorkspaceRuntimeRepository';

type Surface = ReturnType<typeof useCompanionArticleSurface>;
type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

function resolveShellSyncEndpoint(workspaceSync: WorkspaceSync) {
  return workspaceSync.state ? resolveCompanionWorkspaceSyncEndpoint(workspaceSync.state) : null;
}

export function continueCompanionAttachmentResourceSync(workspaceSync: WorkspaceSync) {
  const endpointUrl = resolveShellSyncEndpoint(workspaceSync);
  if (!endpointUrl || workspaceSync.status === 'syncing') {
    return;
  }
  void workspaceSync.pullFromDesktop(endpointUrl).catch(() => undefined);
}

export function CompanionShellReadableArticle(props: { flow?: boolean; searchMatch?: CompanionSearchMatch | null | undefined; onExit: () => void; surface: Surface; workspaceSync: WorkspaceSync }) {
  const breadcrumbItems = useReviewBreadcrumbItems(props.workspaceSync.state.workspace_snapshot,
    props.flow ? props.surface.effectiveReviewSession.currentCard?.nodeId ?? null : null);
  if (!props.surface.readableArticle) return null;
  const activity = props.surface.readingActivity;
  const nodeMutationProps = {
    ...(supportsCompanionNodeMutationSurface('existing-highlight-edit') ? {
      onAddExistingHighlightNote: (...args: Parameters<ReturnType<typeof createCompanionExistingHighlightNoteHandler>>) =>
        activity.run('note', () => createCompanionExistingHighlightNoteHandler(props.workspaceSync)(...args)),
      onDeleteExistingHighlight: (...args: Parameters<ReturnType<typeof createCompanionExistingHighlightDeleteHandler>>) =>
        activity.flush('delete').then(() => activity.run('delete', () => createCompanionExistingHighlightDeleteHandler(props.workspaceSync)(...args)))
    } : {}),
    ...(supportsCompanionNodeMutationSurface('selection-annotation') ? {
      onCreateSelectionAnnotation: (...args: Parameters<ReturnType<typeof createCompanionSelectionAnnotationHandler>>) =>
        activity.run('selection', () => createCompanionSelectionAnnotationHandler(props.workspaceSync)(...args))
    } : {}),
    ...(supportsCompanionNodeMutationSurface('trash-restore') ? {
      onRestoreFromTrash: createCompanionTrashRestoreHandler(props.workspaceSync)
    } : {}),
    ...(supportsCompanionNodeMutationSurface('topic-content-edit') &&
      props.workspaceSync.state.workspace_snapshot?.nodesById[props.surface.readableArticle.nodeId]?.kind === 'topic' ? {
      onSaveArticleContent: createCompanionTopicContentSaveHandler(props.workspaceSync)
    } : {})
  };
  return (
    <ImmersiveReadableArticle
      key={props.surface.readableArticle.nodeId}
      searchMatch={props.searchMatch}
      activity={activity}
      flow={props.flow === true}
      header={props.flow ? <ReviewBreadcrumb items={breadcrumbItems} onSelectItem={props.surface.handleSelectBrowseNode} /> : null}
      answer={props.flow && props.surface.isAnswerRevealed ? props.surface.effectiveReviewSession.currentCard?.reveal ?? null : null}
      footer={props.flow ? <CompanionBottomReviewBar
        hasAnswer={Boolean(props.surface.effectiveReviewSession.currentCard?.hasAnswer)}
        disabled={props.surface.isSubmittingGrade || props.surface.isSubmittingReadingAction || activity.editing ||
          Boolean(props.surface.readableArticle.bodyStatus && props.surface.readableArticle.bodyStatus !== 'ready')}
        isAnswerRevealed={props.surface.isAnswerRevealed}
        itemKind={props.surface.effectiveReviewSession.currentCard?.itemKind ?? 'reading'}
        onReadReviewTopic={props.surface.handleReadReviewTopic}
        onPostponeReviewTopic={props.surface.handlePostponeReviewTopic}
        onDismissReviewTopic={props.surface.handleDismissReviewTopic}
        onSoonReviewTopic={props.surface.handleSoonReviewTopic}
        onGrade={props.surface.handleGradeReview}
        onRevealAnswer={props.surface.handleRevealAnswer}
        reviewCardKey={props.surface.effectiveReviewSession.currentCard?.nodeId ?? null}
        statusLabel={props.surface.readingError ?? props.surface.reviewError ?? props.surface.flowError}
        visible={!activity.editing}
      /> : null}
      onAttachmentResourceSynced={() => continueCompanionAttachmentResourceSync(props.workspaceSync)}
      onExit={props.onExit}
      onScrollTopChange={props.surface.handleViewScroll}
      readableArticle={props.surface.readableArticle}
      snapshot={props.workspaceSync.state.workspace_snapshot}
      syncEndpointUrl={resolveShellSyncEndpoint(props.workspaceSync)}
      {...nodeMutationProps}
    />
  );
}
