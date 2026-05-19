import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';
import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import { CompanionBottomTabBar, type CompanionTabAction } from './CompanionFloatingBars';
import type { CompanionSecondaryDestinationId, CompanionTabConfig } from './CompanionTabsConfig';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

export function CompanionShellOverlays(props: {
  activeSecondaryDestinationId: CompanionSecondaryDestinationId | null;
  companionTabConfig: CompanionTabConfig;
  isBottomBarDisabled: boolean;
  isCaptureSheetOpen: boolean;
  isNavigationVisible: boolean;
  onCaptureSheetOpenChange(open: boolean): void;
  onNavigationAction(action: CompanionTabAction): void;
  onSecondaryDestination(destinationId: CompanionSecondaryDestinationId): void;
  surface: ReturnType<typeof useCompanionArticleSurface>;
}) {
  const currentReviewCard = props.surface.reviewSession.currentCard;
  const isReadableArticleImmersive = props.surface.activeAction === 'recent'
    && Boolean(props.surface.readableArticle)
    && Boolean(props.surface.selectedBrowseNodeId)
    && !props.surface.browsedFolder;

  return (
    <>
      <CompanionBottomTabBar
        activeAction={props.surface.activeAction}
        activeSecondaryDestinationId={props.activeSecondaryDestinationId}
        config={props.companionTabConfig}
        onAction={props.onNavigationAction}
        onSecondaryDestination={props.onSecondaryDestination}
        visible={props.isNavigationVisible && !isReadableArticleImmersive}
      />
      <CompanionCaptureSheet onOpenChange={props.onCaptureSheetOpenChange} open={props.isCaptureSheetOpen} />
      <CompanionBottomReviewBar
        disabled={props.isBottomBarDisabled}
        isAnswerRevealed={props.surface.isAnswerRevealed}
        itemKind={props.surface.reviewSession.currentCard?.itemKind ?? 'reading'}
        onCompleteReviewItem={props.surface.handleCompleteReviewItem}
        onDeferReviewItem={props.surface.handleDeferReviewItem}
        onDismissReviewItem={props.surface.handleDismissReviewItem}
        onGrade={props.surface.handleGradeReview}
        onRevealAnswer={props.surface.handleRevealAnswer}
        reviewCardKey={currentReviewCard ? `${currentReviewCard.itemKind}:${currentReviewCard.nodeId}` : null}
        statusLabel={null}
        visible={props.surface.activeAction === 'review' && Boolean(currentReviewCard)}
      />
    </>
  );
}
