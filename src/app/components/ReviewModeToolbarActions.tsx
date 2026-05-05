import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { AppButton, ToolbarActionGroup } from '../../shared/ui';

function GradeButton({
  ariaLabel,
  onClick,
  disabled
}: {
  ariaLabel: 'Again' | 'Hard' | 'Good' | 'Easy';
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <AppButton aria-label={ariaLabel} className="min-w-24 px-4" disabled={disabled} onClick={onClick} size="md" variant="ghost">
      {ariaLabel}
    </AppButton>
  );
}

export function ReviewGradeActions({
  errorMessage,
  isSubmitting,
  submitGrade
}: {
  errorMessage: string | null;
  isSubmitting: boolean;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2">
      <ToolbarActionGroup ariaLabel="Review grade actions" className="gap-2">
        <GradeButton ariaLabel="Again" disabled={isSubmitting} onClick={() => void submitGrade(1)} />
        <GradeButton ariaLabel="Hard" disabled={isSubmitting} onClick={() => void submitGrade(2)} />
        <GradeButton ariaLabel="Good" disabled={isSubmitting} onClick={() => void submitGrade(3)} />
        <GradeButton ariaLabel="Easy" disabled={isSubmitting} onClick={() => void submitGrade(4)} />
      </ToolbarActionGroup>
      {errorMessage ? (
        <p aria-live="assertive" className="text-xs text-red-600">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export function ReadingReviewActions({
  onCompleteReviewItem,
  onDeferReviewItem,
  onDismissReviewItem
}: {
  onCompleteReviewItem: () => boolean;
  onDeferReviewItem: () => boolean;
  onDismissReviewItem: () => boolean;
}) {
  return (
    <ToolbarActionGroup ariaLabel="Reading review actions" className="gap-2" data-review-toolbar-kind="reading">
      <AppButton aria-label="Later" className="min-w-24 px-4" onClick={onDeferReviewItem} size="md" variant="primary">
        Later
      </AppButton>
      <AppButton aria-label="Read" className="min-w-24 px-4" onClick={onCompleteReviewItem} size="md" variant="primary">
        Read
      </AppButton>
      <AppButton aria-label="Dismiss" className="min-w-24 px-4" onClick={onDismissReviewItem} size="md" variant="primary">
        Dismiss
      </AppButton>
    </ToolbarActionGroup>
  );
}

export function FsrsRevealAction({ onRevealAnswer }: { onRevealAnswer: () => void }) {
  return (
    <ToolbarActionGroup ariaLabel="FSRS reveal actions" className="gap-2" data-review-toolbar-kind="fsrs-prompt">
      <AppButton aria-label="Show Answer" className="min-w-32 px-5" onClick={onRevealAnswer} size="md" variant="primary">
        Show Answer
      </AppButton>
    </ToolbarActionGroup>
  );
}

export function ReviewCompleteAction({ onExitReviewMode }: { onExitReviewMode: () => void }) {
  return (
    <AppButton aria-label="Review complete" className="min-w-32 px-5" onClick={onExitReviewMode} size="md" variant="subtle">
      Review complete
    </AppButton>
  );
}
