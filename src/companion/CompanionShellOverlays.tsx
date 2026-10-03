import { memo, type ComponentProps } from 'react';

import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import { CompanionBottomTabBar, type CompanionTabAction } from './CompanionFloatingBars';
import type { CompanionSecondaryDestinationId, CompanionTabConfig } from './CompanionTabsConfig';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

type Surface = ReturnType<typeof useCompanionArticleSurface>;

export const CompanionShellOverlays = memo(function CompanionShellOverlays(props: {
  captureDraftScope: string;
  activeSecondaryDestinationId: CompanionSecondaryDestinationId | null;
  activeAction: CompanionTabAction;
  companionTabConfig: CompanionTabConfig;
  currentReviewCard: Surface['reviewSession']['currentCard'];
  isBottomBarDisabled: boolean;
  isReadableArticleImmersive: boolean;
  isReviewAnswerRevealed: boolean;
  isCaptureSheetOpen: boolean;
  isNavigationVisible: boolean;
  onCaptureSave: ComponentProps<typeof CompanionCaptureSheet>['onSave'];
  onCaptureSheetOpenChange(open: boolean): void;
  onDismissReviewTopic: Surface['handleDismissReviewTopic'];
  onGradeReview: Surface['handleGradeReview'];
  onNavigationAction(action: CompanionTabAction): void;
  onPostponeReviewTopic: Surface['handlePostponeReviewTopic'];
  onReadReviewTopic: Surface['handleReadReviewTopic'];
  onRevealAnswer: Surface['handleRevealAnswer'];
  onSecondaryDestination(destinationId: CompanionSecondaryDestinationId): void;
}) {

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
      <CompanionCaptureSheet
        draftScope={props.captureDraftScope}
        onOpenChange={props.onCaptureSheetOpenChange}
        onSave={props.onCaptureSave}
        open={props.isCaptureSheetOpen}
      />

    </>
  );
});
