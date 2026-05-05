import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { ReviewActionBar } from '../../shared/ui';

import { FsrsRevealAction, ReadingReviewActions, ReviewCompleteAction, ReviewGradeActions } from './ReviewModeToolbarActions';

interface ReviewModeToolbarProps {
  className?: string;
  showSummary?: boolean;
  isStudyMode: boolean;
  isAnswerRevealed: boolean;
  isCurrentItemGradable: boolean;
  isReviewEditing: boolean;
  reviewCompletedCount: number;
  reviewCurrentNodeId: string | null;
  reviewQueueCount: number;
  onGrade: (grade: ReviewGrade) => Promise<boolean>;
  onCompleteReviewItem: () => boolean;
  onDeferReviewItem: () => boolean;
  onDismissReviewItem: () => boolean;
  onRevealAnswer: () => void;
  onExitReviewMode: () => void;
  style?: CSSProperties;
}

function ReviewCompleteBar({ onExitReviewMode }: { onExitReviewMode: () => void }) {
  return (
    <ReviewActionBar
      ariaLabel="Review mode toolbar"
      mode="study"
      primary={<ReviewCompleteAction onExitReviewMode={onExitReviewMode} />}
    />
  );
}

function useGradeFeedback(
  onGrade: ReviewModeToolbarProps['onGrade'],
  reviewCurrentNodeId: string | null,
  isAnswerRevealed: boolean
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!reviewCurrentNodeId || !isAnswerRevealed) {
      setIsSubmitting(false);
      setErrorMessage(null);
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
          setErrorMessage('Failed to save grade. Please retry.');
          setIsSubmitting(false);
          return;
        }
        setErrorMessage(null);
        setIsSubmitting(false);
      } catch {
        setErrorMessage('Failed to save grade. Please retry.');
        setIsSubmitting(false);
      }
    },
    [isSubmitting, onGrade]
  );

  return { errorMessage, isSubmitting, submitGrade };
}

function ReviewSessionSummary({
  reviewCompletedCount,
  reviewQueueCount
}: Pick<ReviewModeToolbarProps, 'reviewCompletedCount' | 'reviewQueueCount'>) {
  return `${Math.max(reviewQueueCount, 0)} left · ${Math.max(reviewCompletedCount, 0)} done`;
}

export function ReviewModeToolbar({
  className,
  showSummary = true,
  isStudyMode,
  isAnswerRevealed,
  isCurrentItemGradable,
  isReviewEditing,
  reviewCompletedCount,
  reviewCurrentNodeId,
  reviewQueueCount,
  onGrade,
  onCompleteReviewItem,
  onDeferReviewItem,
  onDismissReviewItem,
  onRevealAnswer,
  onExitReviewMode,
  style
}: ReviewModeToolbarProps) {
  const { errorMessage, isSubmitting, submitGrade } = useGradeFeedback(onGrade, reviewCurrentNodeId, isAnswerRevealed);

  if (!isStudyMode) {
    return null;
  }

  if (!reviewCurrentNodeId) {
    return <ReviewCompleteBar onExitReviewMode={onExitReviewMode} />;
  }

  return (
    <ReviewActionBar
      ariaLabel="Review mode toolbar"
      className={className}
      mode={isStudyMode ? 'study' : 'edit'}
      primary={!isCurrentItemGradable ? (
        <ReadingReviewActions
          onCompleteReviewItem={onCompleteReviewItem}
          onDeferReviewItem={onDeferReviewItem}
          onDismissReviewItem={onDismissReviewItem}
        />
      ) : !isAnswerRevealed ? (
        <FsrsRevealAction onRevealAnswer={onRevealAnswer} />
      ) : (
        <ReviewGradeActions
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          submitGrade={submitGrade}
        />
      )}
      reviewInputMode={isReviewEditing ? 'editing' : 'hotkeys'}
      reviewItemKind={isCurrentItemGradable ? 'fsrs' : 'reading'}
      secondary={showSummary ? <ReviewSessionSummary reviewCompletedCount={reviewCompletedCount} reviewQueueCount={reviewQueueCount} /> : null}
      style={style}
    />
  );
}
