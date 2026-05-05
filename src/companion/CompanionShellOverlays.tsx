import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';
import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import { CompanionBottomTabBar, type CompanionTabAction } from './CompanionFloatingBars';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

export function CompanionShellOverlays(props: {
  isBottomBarDisabled: boolean;
  isCaptureSheetOpen: boolean;
  isNavigationVisible: boolean;
  onCaptureSheetOpenChange(open: boolean): void;
  onNavigationAction(action: CompanionTabAction): void;
  surface: ReturnType<typeof useCompanionArticleSurface>;
}) {
  return (
    <>
      <CompanionBottomTabBar
        activeAction={props.surface.activeAction}
        onAction={props.onNavigationAction}
        visible={props.isNavigationVisible}
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
        statusLabel={null}
        visible={props.surface.activeAction === 'review' && Boolean(props.surface.reviewSession.currentCard)}
      />
    </>
  );
}
