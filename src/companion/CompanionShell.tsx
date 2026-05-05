import { useEffect, useMemo, useState } from 'react';

import { CompanionArticleDocument } from './CompanionArticleDocument';
import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';
import { TopFloatingBar } from './CompanionFloatingBars';
import { RecentArticleList } from './CompanionRecentArticleList';
import { useReviewBreadcrumbItems } from './companionReviewBreadcrumbs';
import { CompanionReviewAnswer, CompanionReviewCard } from './CompanionReviewCard';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import { useFloatingBarVisibility } from './useFloatingBarVisibility';

import { NodeBrowseList } from '@/shared/ui';

function formatDueLabel(timestamp: string | null) {
  if (!timestamp) {
    return null;
  }
  return new Date(timestamp).toLocaleString();
}

function renderReviewFallback(
  hasSnapshot: boolean,
  error: string | null,
  reviewSession: ReturnType<typeof useCompanionArticleSurface>['reviewSession']
) {
  const nextFsrsLabel = formatDueLabel(reviewSession.nextFsrsDueAt);
  const nextReadingLabel = formatDueLabel(reviewSession.nextReadingDueAt);
  const hasScheduledReviews = reviewSession.scheduledFsrsCount > 0 || reviewSession.scheduledReadingCount > 0;

  return (
    <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
      {hasSnapshot ? (
        <>
          <p>{hasScheduledReviews ? 'No review items are due right now.' : 'No review items have been scheduled on this device yet.'}</p>
          {nextReadingLabel ? <p className="mt-3">Next reading topic: {nextReadingLabel}</p> : null}
          {nextFsrsLabel ? <p className="mt-2">Next FSRS card: {nextFsrsLabel}</p> : null}
          {hasScheduledReviews ? (
            <p className="mt-3">
              Synced review state: {reviewSession.scheduledReadingCount} reading topics, {reviewSession.scheduledFsrsCount} FSRS cards.
            </p>
          ) : (
            <p className="mt-3">
              Pull a newer desktop snapshot when you want the companion to refresh upcoming review work.
            </p>
          )}
        </>
      ) : (
        <>
          <p>No article has been synced to this device yet.</p>
          <p className="mt-3">
            Keep the desktop client available on the same machine or network. The companion will refresh this reading surface when a newer snapshot is found.
          </p>
        </>
      )}
      {error ? <span className="mt-4 block text-red-700">{error}</span> : null}
    </section>
  );
}

function renderMainContent(
  surface: ReturnType<typeof useCompanionArticleSurface>,
  workspaceError: string | null,
  hasSnapshot: boolean,
  reviewBreadcrumbItems: { id: string; isCurrent?: boolean; label: string; targetNodeId: string }[],
  onSelectReviewBreadcrumbItem: (id: string) => void
) {
  if (surface.activeAction === 'recent') {
    return renderRecentBrowseContent(surface);
  }
  if (surface.activeAction === 'review') {
    return renderReviewContent(surface, workspaceError, hasSnapshot, reviewBreadcrumbItems, onSelectReviewBreadcrumbItem);
  }
  return renderReadableArticleOrFallback(surface, workspaceError, hasSnapshot);
}

function renderRecentBrowseContent(surface: ReturnType<typeof useCompanionArticleSurface>) {
  if (surface.browsedFolder) {
    return (
      <NodeBrowseList
        currentNodeId={surface.selectedBrowseNodeId}
        emptyLabel="This folder does not have any synced children yet."
        items={surface.browsedFolder.items}
        onSelectNode={surface.handleSelectBrowseNode}
      />
    );
  }
  if (surface.readableArticle && surface.selectedBrowseNodeId) {
    return renderReadableArticleDocument(surface.readableArticle);
  }
  return (
    <RecentArticleList
      currentArticleId={surface.readableArticle?.nodeId ?? null}
      onSelectArticle={surface.handleSelectRecentArticle}
      recentArticles={surface.recentArticles}
    />
  );
}

function renderReviewContent(
  surface: ReturnType<typeof useCompanionArticleSurface>,
  workspaceError: string | null,
  hasSnapshot: boolean,
  reviewBreadcrumbItems: { id: string; isCurrent?: boolean; label: string; targetNodeId: string }[],
  onSelectReviewBreadcrumbItem: (id: string) => void
) {
  if (!surface.reviewSession.currentCard) {
    return renderReviewFallback(hasSnapshot, workspaceError, surface.reviewSession);
  }

  return (
    <>
      <CompanionReviewCard
        breadcrumbItems={reviewBreadcrumbItems}
        card={surface.reviewSession.currentCard}
        onSelectBreadcrumbItem={onSelectReviewBreadcrumbItem}
      />
      {surface.reviewSession.currentCard.itemKind === 'fsrs' && surface.isAnswerRevealed ? (
        <CompanionReviewAnswer card={surface.reviewSession.currentCard} />
      ) : null}
      {surface.readingError ? <p className="mt-3 text-sm text-red-700">{surface.readingError}</p> : null}
      {surface.reviewError ? <p className="mt-3 text-sm text-red-700">{surface.reviewError}</p> : null}
    </>
  );
}

function renderReadableArticleDocument(
  readableArticle: NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>
) {
  return (
    <CompanionArticleDocument
      content={readableArticle.content}
      hideTitleHeading={readableArticle.hideTitleHeading}
      nodeId={readableArticle.nodeId}
      textAnchorDecorations={readableArticle.textAnchorDecorations}
    />
  );
}

function renderReadableArticleOrFallback(
  surface: ReturnType<typeof useCompanionArticleSurface>,
  workspaceError: string | null,
  hasSnapshot: boolean
) {
  if (surface.readableArticle) {
    return renderReadableArticleDocument(surface.readableArticle);
  }
  return renderReviewFallback(hasSnapshot, workspaceError, surface.reviewSession);
}

function useImmersiveReviewToolbar(
  floatingBar: ReturnType<typeof useFloatingBarVisibility>,
  isImmersiveReview: boolean,
  currentCardNodeId: string | undefined
) {
  const [isReviewToolbarArmed, setIsReviewToolbarArmed] = useState(false);

  useEffect(() => {
    if (isImmersiveReview) {
      setIsReviewToolbarArmed(false);
      return;
    }
    setIsReviewToolbarArmed(true);
  }, [currentCardNodeId, isImmersiveReview]);

  const isTopBarVisible = useMemo(
    () => (isImmersiveReview ? isReviewToolbarArmed && floatingBar.isVisible : floatingBar.isVisible),
    [floatingBar.isVisible, isImmersiveReview, isReviewToolbarArmed]
  );

  const handleContentTap = () => {
    if (!isImmersiveReview || isReviewToolbarArmed) {
      return;
    }
    setIsReviewToolbarArmed(true);
    floatingBar.revealBar();
  };

  return {
    handleContentTap,
    isTopBarVisible
  };
}

export function CompanionShell() {
  const floatingBar = useFloatingBarVisibility('companion-top-bar');
  const workspaceSync = useCompanionWorkspaceSync();
  const surface = useCompanionArticleSurface(workspaceSync, floatingBar);
  const isBottomBarDisabled = surface.isSubmittingGrade || surface.isSubmittingReadingAction;
  const isImmersiveReview = surface.activeAction === 'review' && Boolean(surface.reviewSession.currentCard);
  const reviewBreadcrumbItems = useReviewBreadcrumbItems(
    workspaceSync.state.workspace_snapshot,
    surface.reviewSession.currentCard?.nodeId ?? null
  );
  const { handleContentTap, isTopBarVisible } = useImmersiveReviewToolbar(
    floatingBar,
    isImmersiveReview,
    surface.reviewSession.currentCard?.nodeId
  );

  return (
    <>
      <main className="h-dvh bg-companion-base text-foreground">
        <div
          className="h-dvh overflow-y-auto"
          data-testid="companion-scroll-container"
          onClick={handleContentTap}
          onScroll={floatingBar.handleContainerScroll}
          onTouchEnd={floatingBar.handleTouchEnd}
          onTouchMove={floatingBar.handleTouchMove}
          onTouchStart={floatingBar.handleTouchStart}
        >
          <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-6 pb-24 pt-4 sm:px-7">
            <div className={isImmersiveReview ? 'h-20' : 'h-auto'}>
              <TopFloatingBar activeAction={surface.activeAction} onAction={surface.handleTopBarAction} visible={isTopBarVisible} />
            </div>
            {renderMainContent(
              surface,
              workspaceSync.error,
              Boolean(workspaceSync.state.workspace_snapshot),
              reviewBreadcrumbItems,
              surface.handleSelectBrowseNode
            )}
          </div>
        </div>
      </main>
      <CompanionBottomReviewBar
        disabled={isBottomBarDisabled}
        isAnswerRevealed={surface.isAnswerRevealed}
        itemKind={surface.reviewSession.currentCard?.itemKind ?? 'reading'}
        onCompleteReviewItem={surface.handleCompleteReviewItem}
        onDeferReviewItem={surface.handleDeferReviewItem}
        onDismissReviewItem={surface.handleDismissReviewItem}
        onGrade={surface.handleGradeReview}
        onRevealAnswer={surface.handleRevealAnswer}
        statusLabel={null}
        visible={surface.activeAction === 'review' && Boolean(surface.reviewSession.currentCard)}
      />
    </>
  );
}
