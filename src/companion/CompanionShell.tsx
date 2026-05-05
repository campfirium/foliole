import { CompanionArticleDocument } from './CompanionArticleDocument';
import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';
import { TopFloatingBar } from './CompanionFloatingBars';
import { RecentArticleList } from './CompanionRecentArticleList';
import { CompanionReviewAnswer, CompanionReviewCard } from './CompanionReviewCard';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import { useFloatingBarVisibility } from './useFloatingBarVisibility';

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
    <section className="rounded-3xl border border-dashed border-border bg-bg-panel px-5 py-8 text-sm leading-6 text-accent">
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
  hasSnapshot: boolean
) {
  if (surface.activeAction === 'recent') {
    return (
      <RecentArticleList
        currentArticleId={surface.readableArticle?.nodeId ?? null}
        onSelectArticle={surface.handleSelectRecentArticle}
        recentArticles={surface.recentArticles}
      />
    );
  }
  if (surface.activeAction === 'review') {
    if (surface.reviewSession.currentCard) {
      return (
        <>
          <CompanionReviewCard card={surface.reviewSession.currentCard} />
          {surface.reviewSession.currentCard.itemKind === 'fsrs' && surface.isAnswerRevealed ? (
            <CompanionReviewAnswer card={surface.reviewSession.currentCard} />
          ) : null}
          {surface.readingError ? <p className="mt-3 text-sm text-red-700">{surface.readingError}</p> : null}
          {surface.reviewError ? <p className="mt-3 text-sm text-red-700">{surface.reviewError}</p> : null}
        </>
      );
    }
    return renderReviewFallback(hasSnapshot, workspaceError, surface.reviewSession);
  }
  if (surface.readableArticle) {
    return <CompanionArticleDocument content={surface.readableArticle.content} nodeId={surface.readableArticle.nodeId} />;
  }
  return renderReviewFallback(hasSnapshot, workspaceError, surface.reviewSession);
}

export function CompanionShell() {
  const floatingBar = useFloatingBarVisibility('companion-top-bar');
  const workspaceSync = useCompanionWorkspaceSync();
  const surface = useCompanionArticleSurface(workspaceSync, floatingBar);
  const isBottomBarDisabled = surface.isSubmittingGrade || surface.isSubmittingReadingAction;

  return (
    <>
      <main className="h-dvh bg-canvas text-foreground">
        <div
          className="h-dvh overflow-y-auto"
          onScroll={floatingBar.handleContainerScroll}
          onTouchEnd={floatingBar.handleTouchEnd}
          onTouchMove={floatingBar.handleTouchMove}
          onTouchStart={floatingBar.handleTouchStart}
        >
          <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-4 pb-24 pt-4 sm:px-6">
            <TopFloatingBar activeAction={surface.activeAction} onAction={surface.handleTopBarAction} visible={floatingBar.isVisible} />
            {renderMainContent(surface, workspaceSync.error, Boolean(workspaceSync.state.workspace_snapshot))}
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
        statusLabel={
          surface.reviewSession.currentCard
            ? isBottomBarDisabled
              ? 'Saving'
              : `${surface.reviewSession.currentCard.remainingCount} due`
            : null
        }
        visible={surface.activeAction === 'review' && Boolean(surface.reviewSession.currentCard)}
      />
    </>
  );
}
