import { useCallback, useEffect, useState } from 'react';

import type { ReviewGrade, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import { ReviewActionBar } from '../../shared/ui';

import { FsrsRevealAction, ReadingReviewActions, ReviewCompleteAction, ReviewGradeActions } from './ReviewModeToolbarActions';
import type { ReviewQueueVisibility } from './reviewQueueVisibility';
import { ReviewQueueVisibilityText } from './ReviewQueueVisibilityText';

interface ReviewModeToolbarProps {
  isStudyMode: boolean;
  isAnswerRevealed: boolean;
  isCurrentItemGradable: boolean;
  isReviewEditing: boolean;
  reviewPreview: SchedulerPreviewResult | null;
  reviewCurrentNodeId: string | null;
  reviewQueueVisibility: ReviewQueueVisibility | null;
  onGrade: (grade: ReviewGrade) => Promise<boolean>;
  onCompleteReviewItem: () => boolean;
  onDeferReviewItem: () => boolean;
  onDismissReviewItem: () => boolean;
  onRevealAnswer: () => void;
  onExitReviewMode: () => void;
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
export function ReviewModeToolbar({
  isStudyMode,
  isAnswerRevealed,
  isCurrentItemGradable,
  isReviewEditing,
  reviewPreview,
  reviewCurrentNodeId,
  reviewQueueVisibility,
  onGrade,
  onCompleteReviewItem,
  onDeferReviewItem,
  onDismissReviewItem,
  onRevealAnswer,
  onExitReviewMode
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
          reviewPreview={reviewPreview}
          submitGrade={submitGrade}
        />
      )}
      reviewInputMode={isReviewEditing ? 'editing' : 'hotkeys'}
      reviewItemKind={isCurrentItemGradable ? 'fsrs' : 'reading'}
      status={reviewQueueVisibility ? <ReviewQueueVisibilityText visibility={reviewQueueVisibility} /> : null}
    />
  );
}
