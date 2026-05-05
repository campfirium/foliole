import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { AppButton, AppToolbar } from '../../shared/ui';

interface ReviewModeToolbarProps {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  isAnswerRevealed: boolean;
  onGrade: (grade: ReviewGrade) => void;
  onRevealAnswer: () => void;
  onStartStudyMode: () => void;
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
    <AppToolbar
      aria-label="Review mode toolbar"
      className="flex min-h-[52px] flex-none items-center bg-bg-elevated px-4 py-2"
      data-mode={isStudyMode ? 'study' : 'edit'}
    >
      <div className="flex w-full items-center justify-center gap-2">
        <AppButton aria-label="Show Answer" onClick={onRevealAnswer} size="sm" variant="primary">
          Show Answer
        </AppButton>
        <AppButton aria-label="Grade 1" className="min-w-24" disabled={!isAnswerRevealed} onClick={() => onGrade(1)} size="sm" variant="ghost">
          1
        </AppButton>
        <AppButton aria-label="Grade 2" className="min-w-24" disabled={!isAnswerRevealed} onClick={() => onGrade(2)} size="sm" variant="ghost">
          2
        </AppButton>
        <AppButton aria-label="Grade 3" className="min-w-24" disabled={!isAnswerRevealed} onClick={() => onGrade(3)} size="sm" variant="ghost">
          3
        </AppButton>
        <AppButton aria-label="Grade 4" className="min-w-24" disabled={!isAnswerRevealed} onClick={() => onGrade(4)} size="sm" variant="ghost">
          4
        </AppButton>
      </div>
    </AppToolbar>
  );
}
