import type { CSSProperties } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { ReviewActionBar } from '../../shared/ui';

import { FsrsRevealAction, ReadingReviewActions, ReviewGradeActions } from './ReviewModeToolbarActions';
import type { ReviewToolbarProgressCounts } from './reviewToolbarProgressLabel';
import { ReviewToolbarProgressLine, ReviewToolbarSessionActions, type ReviewToolbarSessionSummary } from './ReviewToolbarSessionFrame';

export interface ActiveReviewActionBarProps {
  className?: string;
  errorMessage: string | null;
  isAnswerRevealed: boolean;
  isCurrentItemGradable: boolean;
  isReviewEditing: boolean;
  isSubmitting: boolean;
  onCompleteReviewItem: () => Promise<boolean>;
  onDeferReviewItem: () => Promise<boolean>;
  onDismissReviewItem: () => Promise<boolean>;
  onRevealAnswer: () => void;
  onSetReviewSessionMode: (mode: ReviewSessionMode) => void;
  onSoonReviewItem: () => Promise<boolean>;
  retryGrade?: () => Promise<void>;
  reviewCompletedCount: number;
  reviewProgressCounts?: ReviewToolbarProgressCounts;
  reviewQueueCount: number;
  reviewSessionMode: ReviewSessionMode;
  reviewSummary?: ReviewToolbarSessionSummary;
  showProgress?: boolean;
  showSessionModeControl?: boolean;
  showSummary?: boolean;
  style?: CSSProperties;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}

function ActiveReviewProgress(props: Pick<
  ActiveReviewActionBarProps,
  'reviewCompletedCount' | 'reviewProgressCounts' | 'reviewQueueCount' | 'reviewSessionMode' | 'showProgress'
>) {
  if (!props.showProgress) return null;
  return (
    <ReviewToolbarProgressLine
      completedCount={props.reviewCompletedCount}
      {...definedProps({ progressCounts: props.reviewProgressCounts })}
      queueCount={props.reviewQueueCount}
      reviewSessionMode={props.reviewSessionMode}
    />
  );
}

function createActiveReviewActions(props: Pick<
  ActiveReviewActionBarProps,
  | 'errorMessage'
  | 'isAnswerRevealed'
  | 'isCurrentItemGradable'
  | 'isSubmitting'
  | 'onCompleteReviewItem'
  | 'onDeferReviewItem'
  | 'onDismissReviewItem'
  | 'onRevealAnswer'
  | 'onSoonReviewItem'
  | 'retryGrade'
  | 'submitGrade'
>) {
  if (!props.isCurrentItemGradable) {
    return (
      <ReadingReviewActions
        onCompleteReviewItem={props.onCompleteReviewItem}
        onDeferReviewItem={props.onDeferReviewItem}
        onDismissReviewItem={props.onDismissReviewItem}
        onSoonReviewItem={props.onSoonReviewItem}
      />
    );
  }
  if (!props.isAnswerRevealed) {
    return <FsrsRevealAction onRevealAnswer={props.onRevealAnswer} />;
  }
  return (
    <ReviewGradeActions
      errorMessage={props.errorMessage}
      isSubmitting={props.isSubmitting}
      {...definedProps({ onRetry: props.retryGrade })}
      submitGrade={props.submitGrade}
    />
  );
}

function createActiveReviewPrimary(props: ActiveReviewActionBarProps) {
  const actions = createActiveReviewActions({
    errorMessage: props.errorMessage,
    isAnswerRevealed: props.isAnswerRevealed,
    isCurrentItemGradable: props.isCurrentItemGradable,
    isSubmitting: props.isSubmitting,
    onCompleteReviewItem: props.onCompleteReviewItem,
    onDeferReviewItem: props.onDeferReviewItem,
    onDismissReviewItem: props.onDismissReviewItem,
    onRevealAnswer: props.onRevealAnswer,
    onSoonReviewItem: props.onSoonReviewItem,
    ...definedProps({ retryGrade: props.retryGrade }),
    submitGrade: props.submitGrade
  });
  if (!props.showSessionModeControl || (props.isCurrentItemGradable && !props.isAnswerRevealed)) {
    return actions;
  }
  return (
    <ReviewToolbarSessionActions
      actions={actions}
      onSetReviewSessionMode={props.onSetReviewSessionMode}
      reviewSessionMode={props.reviewSessionMode}
      {...definedProps({ summary: props.reviewSummary })}
    />
  );
}

function createActiveReviewSecondary(props: ActiveReviewActionBarProps) {
  if (props.showSessionModeControl || !props.showSummary) return null;
  return `${Math.max(props.reviewQueueCount, 0)} left · ${Math.max(props.reviewCompletedCount, 0)} done`;
}

export function ActiveReviewActionBar(props: ActiveReviewActionBarProps) {
  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ className: props.className, style: props.style })}
      mode="study"
      primary={createActiveReviewPrimary(props)}
      progress={
        <ActiveReviewProgress
          reviewCompletedCount={props.reviewCompletedCount}
          {...definedProps({ reviewProgressCounts: props.reviewProgressCounts })}
          reviewQueueCount={props.reviewQueueCount}
          reviewSessionMode={props.reviewSessionMode}
          showProgress={props.showProgress ?? true}
        />
      }
      reviewInputMode={props.isReviewEditing ? 'editing' : 'hotkeys'}
      reviewItemKind={props.isCurrentItemGradable ? 'fsrs' : 'reading'}
      secondary={createActiveReviewSecondary(props)}
    />
  );
}
