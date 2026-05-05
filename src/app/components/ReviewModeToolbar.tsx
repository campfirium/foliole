import type { ReviewGrade, SchedulerGradeResult, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import { AppButton } from '../../shared/ui';

interface ReviewModeToolbarProps {
  isStudyMode: boolean;
  isAnswerRevealed: boolean;
  isReviewEditing: boolean;
  reviewPreview: SchedulerPreviewResult | null;
  reviewCurrentNodeId: string | null;
  onGrade: (grade: ReviewGrade) => void;
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
  onClick
}: {
  ariaLabel: 'Again' | 'Hard' | 'Good' | 'Easy';
  intervalLabel: string | null;
  onClick: () => void;
}) {
  return (
    <AppButton aria-label={ariaLabel} className="min-w-20" onClick={onClick} size="sm" variant="ghost">
      <span className="flex flex-col items-center leading-tight">
        <span>{ariaLabel}</span>
        {intervalLabel ? <span className="text-[10px] text-foreground/60">{intervalLabel}</span> : null}
      </span>
    </AppButton>
  );
}

export function ReviewModeToolbar({
  isStudyMode,
  isAnswerRevealed,
  isReviewEditing,
  reviewPreview,
  reviewCurrentNodeId,
  onGrade,
  onRevealAnswer,
  onExitReviewMode
}: ReviewModeToolbarProps) {
  if (!isStudyMode) {
    return null;
  }

  if (!reviewCurrentNodeId) {
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

  return (
    <div
      aria-label="Review mode toolbar"
      className="flex h-[56px] w-full flex-none items-center justify-center border-t border-border bg-bg-elevated px-4"
      data-mode={isStudyMode ? 'study' : 'edit'}
      data-review-input-mode={isReviewEditing ? 'editing' : 'hotkeys'}
    >
      {!isAnswerRevealed ? (
        <div className="flex items-center gap-2">
          <AppButton aria-label="Show Answer" onClick={onRevealAnswer} size="sm" variant="primary">
            Show Answer
          </AppButton>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <GradeButton ariaLabel="Again" intervalLabel={formatPreviewInterval(reviewPreview?.Again)} onClick={() => onGrade(1)} />
          <GradeButton ariaLabel="Hard" intervalLabel={formatPreviewInterval(reviewPreview?.Hard)} onClick={() => onGrade(2)} />
          <GradeButton ariaLabel="Good" intervalLabel={formatPreviewInterval(reviewPreview?.Good)} onClick={() => onGrade(3)} />
          <GradeButton ariaLabel="Easy" intervalLabel={formatPreviewInterval(reviewPreview?.Easy)} onClick={() => onGrade(4)} />
        </div>
      )}
    </div>
  );
}
