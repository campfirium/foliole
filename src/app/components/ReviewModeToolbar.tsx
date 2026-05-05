import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { Button } from '../../shared/ui';

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
    <section aria-label="Review mode toolbar" className="workspace-toolbar workspace-review-toolbar" data-mode={isStudyMode ? 'study' : 'edit'}>
      {!isStudyMode ? (
        <div className="review-mode-toolbar-actions">
          <Button aria-label="Study" disabled={!canStartStudyMode} onClick={onStartStudyMode} size="sm" variant="primary">
            Study
          </Button>
        </div>
      ) : (
        <div className="review-mode-toolbar-actions">
          <Button aria-label="Show Answer" onClick={onRevealAnswer} size="sm" variant="primary">
            Show Answer
          </Button>
          <Button aria-label="Grade 1" className="review-grade-button" disabled={!isAnswerRevealed} onClick={() => onGrade(1)} size="sm" variant="ghost">
            1
          </Button>
          <Button aria-label="Grade 2" className="review-grade-button" disabled={!isAnswerRevealed} onClick={() => onGrade(2)} size="sm" variant="ghost">
            2
          </Button>
          <Button aria-label="Grade 3" className="review-grade-button" disabled={!isAnswerRevealed} onClick={() => onGrade(3)} size="sm" variant="ghost">
            3
          </Button>
          <Button aria-label="Grade 4" className="review-grade-button" disabled={!isAnswerRevealed} onClick={() => onGrade(4)} size="sm" variant="ghost">
            4
          </Button>
        </div>
      )}
    </section>
  );
}
