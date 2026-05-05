import { useCallback, useEffect, useState } from 'react';

import type { ReviewGrade, SchedulerGradeResult, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import { AppButton } from '../../shared/ui';

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

function formatPreviewInterval(previewItem?: SchedulerGradeResult) {
  if (!previewItem) {
    return null;
  }
  const dueMs = Date.parse(previewItem.card.due);
  const reviewMs = Date.parse(previewItem.reviewed_at);
  if (!Number.isFinite(dueMs) || !Number.isFinite(reviewMs)) {
    return null;
  }
  const diffMinutes = Math.max(0, Math.round((dueMs - reviewMs) / 60000));
  if (diffMinutes <= 0) {
    return 'Now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays}d`;
  }
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths}mo`;
  }
  return `${Math.round(diffMonths / 12)}y`;
}

function GradeButton({
  ariaLabel,
  intervalLabel,
  onClick,
  disabled
}: {
  ariaLabel: 'Again' | 'Hard' | 'Good' | 'Easy';
  intervalLabel: string | null;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <AppButton aria-label={ariaLabel} className="min-w-20" disabled={disabled} onClick={onClick} size="sm" variant="ghost">
      <span className="flex flex-col items-center leading-tight">
        <span>{ariaLabel}</span>
        {intervalLabel ? <span className="text-[10px] text-foreground/60">{intervalLabel}</span> : null}
      </span>
    </AppButton>
  );
}

function ReviewCompleteBar({ onExitReviewMode }: { onExitReviewMode: () => void }) {
  return (
    <div
      aria-label="Review mode toolbar"
      className="flex h-[56px] w-full flex-none items-center justify-center border-t border-border bg-bg-elevated px-4"
      data-mode="study"
    >
      <AppButton aria-label="Review complete" onClick={onExitReviewMode} size="sm" variant="subtle">
        Review complete
      </AppButton>
    </div>
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

function ReviewGradeActions({
  errorMessage,
  isSubmitting,
  reviewPreview,
  submitGrade
}: {
  errorMessage: string | null;
  isSubmitting: boolean;
  reviewPreview: SchedulerPreviewResult | null;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2">
        <GradeButton
          ariaLabel="Again"
          disabled={isSubmitting}
          intervalLabel={formatPreviewInterval(reviewPreview?.Again)}
          onClick={() => void submitGrade(1)}
        />
        <GradeButton
          ariaLabel="Hard"
          disabled={isSubmitting}
          intervalLabel={formatPreviewInterval(reviewPreview?.Hard)}
          onClick={() => void submitGrade(2)}
        />
        <GradeButton
          ariaLabel="Good"
          disabled={isSubmitting}
          intervalLabel={formatPreviewInterval(reviewPreview?.Good)}
          onClick={() => void submitGrade(3)}
        />
        <GradeButton
          ariaLabel="Easy"
          disabled={isSubmitting}
          intervalLabel={formatPreviewInterval(reviewPreview?.Easy)}
          onClick={() => void submitGrade(4)}
        />
      </div>
      {errorMessage ? (
        <p aria-live="assertive" className="text-[11px] text-red-600">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function ReadingReviewActions({
  onCompleteReviewItem,
  onDeferReviewItem,
  onDismissReviewItem
}: Pick<ReviewModeToolbarProps, 'onCompleteReviewItem' | 'onDeferReviewItem' | 'onDismissReviewItem'>) {
  return (
    <div className="flex items-center gap-2" data-review-toolbar-kind="reading">
      <AppButton aria-label="Later" onClick={onDeferReviewItem} size="sm" variant="ghost">
        Later
      </AppButton>
      <AppButton aria-label="Read" onClick={onCompleteReviewItem} size="sm" variant="primary">
        Read
      </AppButton>
      <AppButton aria-label="Dismiss" onClick={onDismissReviewItem} size="sm" variant="ghost">
        Dismiss
      </AppButton>
    </div>
  );
}

function FsrsRevealAction({ onRevealAnswer }: Pick<ReviewModeToolbarProps, 'onRevealAnswer'>) {
  return (
    <div className="flex items-center gap-2" data-review-toolbar-kind="fsrs-prompt">
      <AppButton aria-label="Show Answer" onClick={onRevealAnswer} size="sm" variant="primary">
        Show Answer
      </AppButton>
    </div>
  );
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
    <div
      aria-label="Review mode toolbar"
      className="flex min-h-[56px] w-full flex-none flex-col items-center justify-center gap-1 border-t border-border bg-bg-elevated px-4 py-1"
      data-mode={isStudyMode ? 'study' : 'edit'}
      data-review-input-mode={isReviewEditing ? 'editing' : 'hotkeys'}
      data-review-item-kind={isCurrentItemGradable ? 'fsrs' : 'reading'}
    >
      {!isCurrentItemGradable ? (
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
      {reviewQueueVisibility ? <ReviewQueueVisibilityText visibility={reviewQueueVisibility} /> : null}
    </div>
  );
}
