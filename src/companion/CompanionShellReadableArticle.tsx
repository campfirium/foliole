import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';
import { CompanionNextTopicFooter } from './CompanionNextTopicFooter';
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
import { useCompanionReadingNavigation, type CompanionReadingNavigation, type CompanionReadingNavigationControls } from './useCompanionReadingNavigation';
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

function canContinueToNext(article: NonNullable<Surface['readableArticle']>) {
  return !article.bodyStatus || article.bodyStatus === 'ready' || article.bodyStatus === 'empty';
}

function TopicNavigationFooter({ navigation }: { navigation: CompanionReadingNavigationControls | undefined }) {
  const t = useTranslation();
  if (!navigation) return null;
  return <>
    {navigation.next ? <CompanionNextTopicFooter disabled={navigation.disabled} onOpen={navigation.next} /> : null}
    {navigation.error ? <p className="text-sm text-error" role="alert">{t('companion.reading.nextTopicError')}</p> : null}
  </>;
}

function resolveNodeMutationProps(workspaceSync: WorkspaceSync, activity: Surface['readingActivity'], nodeId: string) {
  return {
    ...(supportsCompanionNodeMutationSurface('existing-highlight-edit') ? {
      onAddExistingHighlightNote: (...args: Parameters<ReturnType<typeof createCompanionExistingHighlightNoteHandler>>) =>
        activity.run('note', () => createCompanionExistingHighlightNoteHandler(workspaceSync)(...args)),
      onDeleteExistingHighlight: (...args: Parameters<ReturnType<typeof createCompanionExistingHighlightDeleteHandler>>) =>
        activity.flush('delete').then(() => activity.run('delete', () => createCompanionExistingHighlightDeleteHandler(workspaceSync)(...args)))
    } : {}),
    ...(supportsCompanionNodeMutationSurface('selection-annotation') ? {
      onCreateSelectionAnnotation: (...args: Parameters<ReturnType<typeof createCompanionSelectionAnnotationHandler>>) =>
        activity.run('selection', () => createCompanionSelectionAnnotationHandler(workspaceSync)(...args))
    } : {}),
    ...(supportsCompanionNodeMutationSurface('trash-restore') ? {
      onRestoreFromTrash: createCompanionTrashRestoreHandler(workspaceSync)
    } : {}),
    ...(supportsCompanionNodeMutationSurface('topic-content-edit') &&
      workspaceSync.state.workspace_snapshot?.nodesById[nodeId]?.kind === 'topic' ? {
      onSaveArticleContent: createCompanionTopicContentSaveHandler(workspaceSync)
    } : {})
  };
}

export function CompanionShellReadableArticle(props: { flow?: boolean; searchMatch?: CompanionSearchMatch | null | undefined; navigation?: CompanionReadingNavigation | undefined; onExit: () => void; surface: Surface; workspaceSync: WorkspaceSync }) {
  const breadcrumbItems = useReviewBreadcrumbItems(props.workspaceSync.state.workspace_snapshot,
    props.flow ? props.surface.effectiveReviewSession.currentCard?.nodeId ?? null : null);
  const navigation = useCompanionReadingNavigation(props.surface.readingActivity,
    !props.flow && props.surface.readableArticle && canContinueToNext(props.surface.readableArticle) ? props.navigation : undefined);
  if (!props.surface.readableArticle) return null;
  const activity = props.surface.readingActivity;

  return (
    <ImmersiveReadableArticle
      key={props.surface.readableArticle.nodeId}
      searchMatch={props.searchMatch}
      navigation={navigation}
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
      /> : <TopicNavigationFooter navigation={navigation} />}
      onAttachmentResourceSynced={() => continueCompanionAttachmentResourceSync(props.workspaceSync)}
      onExit={props.onExit}
      onScrollTopChange={props.surface.handleViewScroll}
      readableArticle={props.surface.readableArticle}
      snapshot={props.workspaceSync.state.workspace_snapshot}
      syncEndpointUrl={resolveShellSyncEndpoint(props.workspaceSync)}
      {...resolveNodeMutationProps(props.workspaceSync, activity, props.surface.readableArticle.nodeId)}
    />
  );
}
