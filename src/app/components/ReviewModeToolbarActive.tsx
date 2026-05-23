import type { CSSProperties } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { ReviewActionBar } from '../../shared/ui';

import { FsrsRevealAction, ReadingReviewActions, ReviewGradeActions } from './ReviewModeToolbarActions';
import { ReviewToolbarProgressLine, ReviewToolbarSessionActions, type ReviewToolbarSessionSummary } from './ReviewToolbarSessionFrame';

export interface ActiveReviewActionBarProps {
  className?: string;
  errorMessage: string | null;
  isAnswerRevealed: boolean;
  isCurrentItemGradable: boolean;
  isReviewEditing: boolean;
  isSubmitting: boolean;
  onCompleteReviewItem: () => boolean;
  onDeferReviewItem: () => boolean;
  onDismissReviewItem: () => boolean;
  onRevealAnswer: () => void;
  onSetReviewSessionMode: (mode: ReviewSessionMode) => void;
  onSoonReviewItem: () => boolean;
  retryGrade?: () => Promise<void>;
  reviewCompletedCount: number;
  reviewQueueCount: number;
  reviewSessionMode: ReviewSessionMode;
  reviewSummary?: ReviewToolbarSessionSummary;
  showProgress?: boolean;
  showSessionModeControl?: boolean;
  showSummary?: boolean;
  style?: CSSProperties;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}

function ActiveReviewProgress({
  reviewCompletedCount,
  reviewQueueCount,
  reviewSessionMode,
  showProgress
}: Pick<ActiveReviewActionBarProps, 'reviewCompletedCount' | 'reviewQueueCount' | 'reviewSessionMode' | 'showProgress'>) {
  if (!showProgress) return null;
  return (
    <ReviewToolbarProgressLine
      completedCount={reviewCompletedCount}
      queueCount={reviewQueueCount}
      reviewSessionMode={reviewSessionMode}
    />
  );
}

export function ActiveReviewActionBar({
  className, errorMessage, isAnswerRevealed, isCurrentItemGradable, isReviewEditing,
  isSubmitting, onCompleteReviewItem, onDeferReviewItem, onDismissReviewItem, onSoonReviewItem,
  onRevealAnswer, onSetReviewSessionMode, retryGrade, reviewCompletedCount, reviewQueueCount,
  reviewSessionMode, reviewSummary,
  showProgress = true, showSessionModeControl, showSummary, style, submitGrade
}: ActiveReviewActionBarProps) {
  const actions = !isCurrentItemGradable ? (
    <ReadingReviewActions onCompleteReviewItem={onCompleteReviewItem} onDeferReviewItem={onDeferReviewItem} onDismissReviewItem={onDismissReviewItem} onSoonReviewItem={onSoonReviewItem} />
  ) : !isAnswerRevealed ? (
    <FsrsRevealAction onRevealAnswer={onRevealAnswer} />
  ) : (
    <ReviewGradeActions
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      {...definedProps({ onRetry: retryGrade })}
      submitGrade={submitGrade}
    />
  );
  const showActionFrame = showSessionModeControl && (!isCurrentItemGradable || isAnswerRevealed);

  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ className, style })}
      mode="study"
      primary={showActionFrame ? (
        <ReviewToolbarSessionActions
          actions={actions}
          onSetReviewSessionMode={onSetReviewSessionMode}
          reviewSessionMode={reviewSessionMode}
          {...definedProps({ summary: reviewSummary })}
        />
      ) : actions}
      progress={<ActiveReviewProgress reviewCompletedCount={reviewCompletedCount} reviewQueueCount={reviewQueueCount} reviewSessionMode={reviewSessionMode} showProgress={showProgress} />}
      reviewInputMode={isReviewEditing ? 'editing' : 'hotkeys'}
      reviewItemKind={isCurrentItemGradable ? 'fsrs' : 'reading'}
      secondary={!showSessionModeControl && showSummary ? `${Math.max(reviewQueueCount, 0)} left · ${Math.max(reviewCompletedCount, 0)} done` : null}
    />
  );
}
