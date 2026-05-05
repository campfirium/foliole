import { Button } from '../../shared/ui';

interface ReviewModeToolbarProps {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  onStartStudyMode: () => void;
}

export function ReviewModeToolbar({
  canStartStudyMode,
  isStudyMode,
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
          <Button aria-label="Grade 1" className="review-grade-button" size="sm" variant="ghost">
            1
          </Button>
          <Button aria-label="Grade 2" className="review-grade-button" size="sm" variant="ghost">
            2
          </Button>
          <Button aria-label="Grade 3" className="review-grade-button" size="sm" variant="ghost">
            3
          </Button>
          <Button aria-label="Grade 4" className="review-grade-button" size="sm" variant="ghost">
            4
          </Button>
        </div>
      )}
    </section>
  );
}
