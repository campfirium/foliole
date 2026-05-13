import type { ReviewGrade } from '../../features/review/model/reviewTypes';

import { AppButton } from './Button';
import { ToolbarActionGroup } from './ToolbarActionGroup';

function ReviewGradeButton(props: {
  buttonClassName?: string;
  buttonVariant: 'ghost' | 'primary';
  disabled: boolean;
  grade: ReviewGrade;
  label: 'Again' | 'Hard' | 'Good' | 'Easy';
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}) {
  return (
    <AppButton
      aria-label={props.label}
      className={props.buttonClassName ?? 'min-w-24 px-4'}
      disabled={props.disabled}
      onClick={() => void props.submitGrade(props.grade)}
      size="md"
      variant={props.buttonVariant}
    >
      {props.label}
    </AppButton>
  );
}

function ReviewGradeErrorFeedback(props: {
  errorMessage: string | null;
  isSubmitting: boolean;
  onRetry?: () => void;
}) {
  if (!props.errorMessage) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <p aria-live="assertive" className="text-xs text-error">
        {props.errorMessage}
      </p>
      {props.onRetry ? (
        <AppButton disabled={props.isSubmitting} onClick={props.onRetry} size="sm" variant="ghost">
          Retry
        </AppButton>
      ) : null}
    </div>
  );
}

export function ReviewGradeActions({
  buttonClassName,
  buttonVariant = 'primary',
  errorMessage,
  groupClassName,
  isSubmitting,
  onRetry,
  submitGrade
}: {
  buttonClassName?: string;
  buttonVariant?: 'ghost' | 'primary';
  errorMessage: string | null;
  groupClassName?: string;
  isSubmitting: boolean;
  onRetry?: () => void;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2">
      <ToolbarActionGroup ariaLabel="Review grade actions" className={groupClassName ?? 'gap-2'}>
        <ReviewGradeButton
          {...(buttonClassName !== undefined ? { buttonClassName } : {})}
          buttonVariant={buttonVariant}
          disabled={isSubmitting}
          grade={1}
          label="Again"
          submitGrade={submitGrade}
        />
        <ReviewGradeButton
          {...(buttonClassName !== undefined ? { buttonClassName } : {})}
          buttonVariant={buttonVariant}
          disabled={isSubmitting}
          grade={2}
          label="Hard"
          submitGrade={submitGrade}
        />
        <ReviewGradeButton
          {...(buttonClassName !== undefined ? { buttonClassName } : {})}
          buttonVariant={buttonVariant}
          disabled={isSubmitting}
          grade={3}
          label="Good"
          submitGrade={submitGrade}
        />
        <ReviewGradeButton
          {...(buttonClassName !== undefined ? { buttonClassName } : {})}
          buttonVariant={buttonVariant}
          disabled={isSubmitting}
          grade={4}
          label="Easy"
          submitGrade={submitGrade}
        />
      </ToolbarActionGroup>
      <ReviewGradeErrorFeedback errorMessage={errorMessage} isSubmitting={isSubmitting} {...(onRetry ? { onRetry } : {})} />
    </div>
  );
}

export function ReadingReviewActions({
  onCompleteReviewItem,
  onDeferReviewItem,
  onDismissReviewItem
}: {
  onCompleteReviewItem: () => void;
  onDeferReviewItem: () => void;
  onDismissReviewItem: () => void;
}) {
  return (
    <ToolbarActionGroup ariaLabel="Reading review actions" className="gap-2" data-review-toolbar-kind="reading">
      <AppButton aria-label="Later" className="min-w-24 border-border px-4" onClick={onDeferReviewItem} size="md" variant="primary">
        Later
      </AppButton>
      <AppButton aria-label="Read" className="min-w-24 border-border px-4" onClick={onCompleteReviewItem} size="md" variant="primary">
        Read
      </AppButton>
      <AppButton aria-label="Dismiss" className="min-w-24 border-border px-4" onClick={onDismissReviewItem} size="md" variant="primary">
        Dismiss
      </AppButton>
    </ToolbarActionGroup>
  );
}

export function FsrsRevealAction({ onRevealAnswer }: { onRevealAnswer: () => void }) {
  return (
    <ToolbarActionGroup ariaLabel="Item reveal actions" className="gap-2" data-review-toolbar-kind="fsrs-prompt">
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
