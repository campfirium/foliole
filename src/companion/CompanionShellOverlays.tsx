import { memo } from 'react';

import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';
import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import { CompanionBottomTabBar, type CompanionTabAction } from './CompanionFloatingBars';
import type { CompanionSecondaryDestinationId, CompanionTabConfig } from './CompanionTabsConfig';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

type Surface = ReturnType<typeof useCompanionArticleSurface>;

export const CompanionShellOverlays = memo(function CompanionShellOverlays(props: {
  activeSecondaryDestinationId: CompanionSecondaryDestinationId | null;
  activeAction: CompanionTabAction;
  companionTabConfig: CompanionTabConfig;
  currentReviewCard: Surface['reviewSession']['currentCard'];
  isBottomBarDisabled: boolean;
  isReadableArticleImmersive: boolean;
  isReviewAnswerRevealed: boolean;
  isCaptureSheetOpen: boolean;
  isNavigationVisible: boolean;
  onCaptureSheetOpenChange(open: boolean): void;
  onDismissReviewTopic: Surface['handleDismissReviewTopic'];
  onGradeReview: Surface['handleGradeReview'];
  onNavigationAction(action: CompanionTabAction): void;
  onPostponeReviewTopic: Surface['handlePostponeReviewTopic'];
  onReadReviewTopic: Surface['handleReadReviewTopic'];
  onRevealAnswer: Surface['handleRevealAnswer'];
  onSecondaryDestination(destinationId: CompanionSecondaryDestinationId): void;
}) {
  const currentReviewCard = props.currentReviewCard;

  return (
    <>
      <CompanionBottomTabBar
        activeAction={props.activeAction}
        activeSecondaryDestinationId={props.activeSecondaryDestinationId}
        config={props.companionTabConfig}
        onAction={props.onNavigationAction}
        onSecondaryDestination={props.onSecondaryDestination}
        visible={props.isNavigationVisible && !props.isReadableArticleImmersive}
      />
      <CompanionCaptureSheet onOpenChange={props.onCaptureSheetOpenChange} open={props.isCaptureSheetOpen} />
      <CompanionBottomReviewBar
        disabled={props.isBottomBarDisabled}
        hasAnswer={Boolean(currentReviewCard?.reveal)}
        isAnswerRevealed={props.isReviewAnswerRevealed}
        itemKind={currentReviewCard?.itemKind ?? 'reading'}
        onReadReviewTopic={props.onReadReviewTopic}
        onPostponeReviewTopic={props.onPostponeReviewTopic}
        onDismissReviewTopic={props.onDismissReviewTopic}
        onGrade={props.onGradeReview}
        onRevealAnswer={props.onRevealAnswer}
        reviewCardKey={currentReviewCard ? `${currentReviewCard.itemKind}:${currentReviewCard.nodeId}` : null}
        statusLabel={null}
        visible={props.activeAction === 'review' && Boolean(currentReviewCard)}
      />
    </>
  );
});
