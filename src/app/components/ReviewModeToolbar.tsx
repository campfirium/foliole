import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { AppButton } from '../../shared/ui';

interface ReviewModeToolbarProps {
  isStudyMode: boolean;
  isAnswerRevealed: boolean;
  onGrade: (grade: ReviewGrade) => void;
  onRevealAnswer: () => void;
}

export function ReviewModeToolbar({
  isStudyMode,
  isAnswerRevealed,
  onGrade,
  onRevealAnswer
}: ReviewModeToolbarProps) {
  if (!isStudyMode) {
    return null;
  }

  return (
    <div
      aria-label="Review mode toolbar"
      className="flex h-[56px] w-full flex-none items-center justify-center border-t border-border bg-bg-elevated px-4"
      data-mode={isStudyMode ? 'study' : 'edit'}
    >
      {!isAnswerRevealed ? (
        <AppButton aria-label="Show Answer" onClick={onRevealAnswer} size="sm" variant="primary">
          Show Answer
        </AppButton>
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
