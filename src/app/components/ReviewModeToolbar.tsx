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
  canStartStudyMode,
  isStudyMode,
  isAnswerRevealed,
  onGrade,
  onRevealAnswer,
  onStartStudyMode
}: ReviewModeToolbarProps) {
  return (
    <AppToolbar
      aria-label="Review mode toolbar"
      className="flex min-h-[56px] flex-none items-center rounded-xl border border-amber-900/15 bg-gradient-to-r from-[#f8f2e8] to-[#f3e9d8] px-4 py-3 shadow-[0_8px_18px_-16px_rgba(120,79,35,0.6)]"
      data-mode={isStudyMode ? 'study' : 'edit'}
    >
      {!isStudyMode ? (
        <div className="flex items-center justify-start gap-2">
          <AppButton aria-label="Study" disabled={!canStartStudyMode} onClick={onStartStudyMode} size="sm" variant="primary">
            Study
          </AppButton>
        </div>
      ) : (
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
      )}
    </AppToolbar>
  );
}
