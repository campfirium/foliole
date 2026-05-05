import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { AppButton } from '../../shared/ui';

interface ReviewModeToolbarProps {
  isStudyMode: boolean;
  isAnswerRevealed: boolean;
  isReviewEditing: boolean;
  reviewCurrentNodeId: string | null;
  onGrade: (grade: ReviewGrade) => void;
  onRevealAnswer: () => void;
  onExitReviewMode: () => void;
}

export function ReviewModeToolbar({
  isStudyMode,
  isAnswerRevealed,
  isReviewEditing,
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
          <AppButton aria-label="Again" className="min-w-20" onClick={() => onGrade(1)} size="sm" variant="ghost">
            Again
          </AppButton>
          <AppButton aria-label="Hard" className="min-w-20" onClick={() => onGrade(2)} size="sm" variant="ghost">
            Hard
          </AppButton>
          <AppButton aria-label="Good" className="min-w-20" onClick={() => onGrade(3)} size="sm" variant="ghost">
            Good
          </AppButton>
          <AppButton aria-label="Easy" className="min-w-20" onClick={() => onGrade(4)} size="sm" variant="ghost">
            Easy
          </AppButton>
        </div>
      )}
    </div>
  );
}
