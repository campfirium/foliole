import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { ReviewActionBar } from '../../shared/ui';

import { FsrsRevealAction, ReadingReviewActions, ResumeReviewAction, ReviewGradeActions } from './ReviewModeToolbarActions';
import { ReviewNoCurrentItemBar } from './ReviewModeToolbarNoCurrent';
import { ReviewToolbarProgressLine, ReviewToolbarSessionActions } from './ReviewToolbarSessionFrame';

interface ReviewModeToolbarProps {
  className?: string;
  showSessionModeControl?: boolean;
  showSummary?: boolean;
  isStudyMode: boolean;
  isAnswerRevealed: boolean;
  isCurrentItemGradable: boolean;
  isCurrentReviewItemVisible: boolean;
  isReviewEditing: boolean;
  reviewCompletedCount: number;
  reviewCurrentNodeId: string | null;
  reviewCurrentTitle: string | undefined;
  reviewQueueCount: number;
  reviewStatus: 'idle' | 'awaiting-answer' | 'answer-revealed' | 'completed';
  reviewSessionMode: ReviewSessionMode;
  onGrade: (grade: ReviewGrade) => Promise<boolean>;
  onCompleteReviewItem: () => boolean;
  onDeferReviewItem: () => boolean;
  onDismissReviewItem: () => boolean;
  onContinueReading: () => void;
  onRevealAnswer: () => void;
  onExitReviewMode: () => void;
  onResumeReviewItem: () => void;
  onSetReviewSessionMode: (mode: ReviewSessionMode) => void;
  showProgress?: boolean;
  style?: CSSProperties;
}

function useGradeFeedback(
  onGrade: ReviewModeToolbarProps['onGrade'],
  reviewCurrentNodeId: string | null,
  isAnswerRevealed: boolean
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedGrade, setFailedGrade] = useState<ReviewGrade | null>(null);
  useEffect(() => {
    if (!reviewCurrentNodeId || !isAnswerRevealed) {
      setIsSubmitting(false);
      setErrorMessage(null);
      setFailedGrade(null);
    }
  }, [isAnswerRevealed, reviewCurrentNodeId]);

  const submitGrade = useCallback(
    async (grade: ReviewGrade) => {
      if (isSubmitting) {
        return;
      }
      setIsSubmitting(true);
      try {
        const graded = await onGrade(grade);
        if (!graded) {
          setFailedGrade(grade);
          setErrorMessage('Failed to save grade. Please retry.');
          setIsSubmitting(false);
          return;
        }
        setFailedGrade(null);
        setErrorMessage(null);
        setIsSubmitting(false);
      } catch {
        setFailedGrade(grade);
        setErrorMessage('Failed to save grade. Please retry.');
        setIsSubmitting(false);
      }
    },
    [isSubmitting, onGrade]
  );

  const retryGrade = useCallback(async () => {
    if (failedGrade) {
      await submitGrade(failedGrade);
    }
  }, [failedGrade, submitGrade]);

  return { errorMessage, isSubmitting, retryGrade: failedGrade ? retryGrade : undefined, submitGrade };
}

function ReviewPausedSummary({ reviewCurrentTitle }: Pick<ReviewModeToolbarProps, 'reviewCurrentTitle'>) {
  const title = reviewCurrentTitle?.trim();
  return title ? `Review paused · ${title}` : 'Review paused';
}

function ActiveReviewActionBar({
  className, errorMessage, isAnswerRevealed, isCurrentItemGradable, isReviewEditing,
  isSubmitting, onCompleteReviewItem, onDeferReviewItem, onDismissReviewItem,
  onRevealAnswer, onSetReviewSessionMode, retryGrade, reviewCompletedCount, reviewQueueCount,
  reviewSessionMode,
  showProgress = true, showSessionModeControl, showSummary, style, submitGrade
}: Pick<
  ReviewModeToolbarProps,
  | 'className'
  | 'isAnswerRevealed'
  | 'isCurrentItemGradable'
  | 'isReviewEditing'
  | 'onCompleteReviewItem'
  | 'onDeferReviewItem'
  | 'onDismissReviewItem'
  | 'onRevealAnswer'
  | 'onSetReviewSessionMode'
  | 'reviewCompletedCount'
  | 'reviewQueueCount'
  | 'reviewSessionMode'
  | 'showSessionModeControl'
  | 'showProgress'
  | 'showSummary'
  | 'style'
> & ReturnType<typeof useGradeFeedback>) {
  const actions = !isCurrentItemGradable ? (
    <ReadingReviewActions onCompleteReviewItem={onCompleteReviewItem} onDeferReviewItem={onDeferReviewItem} onDismissReviewItem={onDismissReviewItem} />
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
      ariaLabel="Review mode toolbar"
      {...definedProps({ className, style })}
      mode="study"
      primary={showActionFrame ? (
        <ReviewToolbarSessionActions actions={actions} onSetReviewSessionMode={onSetReviewSessionMode} reviewSessionMode={reviewSessionMode} />
      ) : actions}
      progress={showProgress ? <ReviewToolbarProgressLine completedCount={reviewCompletedCount} queueCount={reviewQueueCount} /> : null}
      reviewInputMode={isReviewEditing ? 'editing' : 'hotkeys'}
      reviewItemKind={isCurrentItemGradable ? 'fsrs' : 'reading'}
      secondary={!showSessionModeControl && showSummary ? `${Math.max(reviewQueueCount, 0)} left · ${Math.max(reviewCompletedCount, 0)} done` : null}
    />
  );
}

export function ReviewModeToolbar({
  className, showSessionModeControl = false, showSummary = true, isStudyMode,
  isAnswerRevealed, isCurrentItemGradable, isCurrentReviewItemVisible, isReviewEditing,
  reviewCompletedCount, reviewCurrentNodeId, reviewQueueCount, onGrade,
  onCompleteReviewItem, onDeferReviewItem, onDismissReviewItem, onRevealAnswer,
  onContinueReading, onResumeReviewItem, onSetReviewSessionMode, reviewCurrentTitle, reviewSessionMode, reviewStatus,
  showProgress = true, style
}: ReviewModeToolbarProps) {
  const { errorMessage, isSubmitting, retryGrade, submitGrade } = useGradeFeedback(onGrade, reviewCurrentNodeId, isAnswerRevealed);

  if (!isStudyMode) return null;

  if (!reviewCurrentNodeId) {
    return (
      <ReviewNoCurrentItemBar
        {...definedProps({ className, style })}
        onContinueReading={onContinueReading}
        onResumeReviewItem={onResumeReviewItem}
        reviewCompletedCount={reviewCompletedCount}
        reviewQueueCount={reviewQueueCount}
        reviewStatus={reviewStatus}
        showSummary={showSummary}
      />
    );
  }

  if (!isCurrentReviewItemVisible) {
    return (
      <ReviewActionBar
        ariaLabel="Review mode toolbar"
        {...definedProps({ className, style })}
        mode="study"
        primary={<ResumeReviewAction onResumeReviewItem={onResumeReviewItem} />}
        progress={showProgress ? <ReviewToolbarProgressLine completedCount={reviewCompletedCount} queueCount={reviewQueueCount} /> : null}
        secondary={showSummary ? <ReviewPausedSummary reviewCurrentTitle={reviewCurrentTitle} /> : null}
      />
    );
  }

  return (
    <ActiveReviewActionBar
      errorMessage={errorMessage}
      isAnswerRevealed={isAnswerRevealed}
      isCurrentItemGradable={isCurrentItemGradable}
      isReviewEditing={isReviewEditing}
      isSubmitting={isSubmitting}
      onCompleteReviewItem={onCompleteReviewItem}
      onDeferReviewItem={onDeferReviewItem}
      onDismissReviewItem={onDismissReviewItem}
      onRevealAnswer={onRevealAnswer}
      onSetReviewSessionMode={onSetReviewSessionMode}
      retryGrade={retryGrade}
      reviewCompletedCount={reviewCompletedCount}
      reviewQueueCount={reviewQueueCount}
      reviewSessionMode={reviewSessionMode}
      showProgress={showProgress}
      showSessionModeControl={showSessionModeControl}
      showSummary={showSummary}
      submitGrade={submitGrade}
      {...definedProps({ className, style })}
    />
  );
}
