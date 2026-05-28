import type { ReactNode } from 'react';

import type { ReviewGrade } from '../../features/review/model/reviewTypes';

import { ActionHelpCard, type ActionHelpCardCopy } from './ActionHelpCard';
import { AppButton } from './Button';
import { REVIEW_GRADE_ACTION_HELP } from './reviewActionHelp';
import { overlayDividerClass, type ReviewActionSurface } from './reviewActionLayout';
import { renderOverlayDividedActions, ReviewOverlayActionButton } from './ReviewOverlayActionButton';
import { ToolbarActionGroup } from './ToolbarActionGroup';

export { ReadingReviewActions } from './ReadingReviewActions';
export type { ReviewActionSurface } from './reviewActionLayout';

const reviewGradeButtons = [
  { grade: 1, label: 'Again' },
  { grade: 2, label: 'Hard' },
  { grade: 3, label: 'Good' },
  { grade: 4, label: 'Easy' }
] as const satisfies ReadonlyArray<{ grade: ReviewGrade; label: 'Again' | 'Hard' | 'Good' | 'Easy' }>;

function ReviewGradeButton(props: {
  buttonClassName?: string;
  buttonVariant: 'ghost' | 'primary';
  disabled: boolean;
  grade: ReviewGrade;
  label: 'Again' | 'Hard' | 'Good' | 'Easy';
  surface: ReviewActionSurface;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}) {
  if (props.surface === 'overlay') {
    return <ReviewOverlayActionButton disabled={props.disabled} label={props.label} onClick={() => void props.submitGrade(props.grade)} />;
  }

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
  showActionHelp = false,
  surface = 'panel',
  submitGrade
}: {
  buttonClassName?: string;
  buttonVariant?: 'ghost' | 'primary';
  errorMessage: string | null;
  groupClassName?: string;
  isSubmitting: boolean;
  onRetry?: () => void;
  showActionHelp?: boolean;
  surface?: ReviewActionSurface;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}) {
  const wrapWithHelpCard = (button: ReactNode, help: ActionHelpCardCopy) =>
    showActionHelp ? (
      <ActionHelpCard help={help} placement="above">
        {button}
      </ActionHelpCard>
    ) : button;
  return (
    <div className="flex items-center gap-2">
      <ToolbarActionGroup ariaLabel="Review grade actions" className={groupClassName ?? `gap-2 ${overlayDividerClass(surface)}`}>
        {renderOverlayDividedActions(
          reviewGradeButtons.map((gradeButton) => ({
            key: String(gradeButton.grade),
            node: wrapWithHelpCard(
              <ReviewGradeButton
                {...(buttonClassName !== undefined ? { buttonClassName } : {})}
                buttonVariant={buttonVariant}
                disabled={isSubmitting}
                grade={gradeButton.grade}
                label={gradeButton.label}
                surface={surface}
                submitGrade={submitGrade}
              />,
              REVIEW_GRADE_ACTION_HELP[gradeButton.label.toLowerCase() as keyof typeof REVIEW_GRADE_ACTION_HELP]
            )
          })),
          surface
        )}
      </ToolbarActionGroup>
      <ReviewGradeErrorFeedback errorMessage={errorMessage} isSubmitting={isSubmitting} {...(onRetry ? { onRetry } : {})} />
    </div>
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
    <AppButton aria-label="Queue clear" className="min-w-32 px-5" onClick={onExitReviewMode} size="md" variant="subtle">
      Queue clear
    </AppButton>
  );
}

export function ResumeReviewAction({
  onResumeReviewItem,
  surface = 'panel'
}: {
  onResumeReviewItem: () => void;
  surface?: ReviewActionSurface;
}) {
  if (surface === 'overlay') {
    return <ReviewOverlayActionButton ariaLabel="Resume review" label="Resume" onClick={onResumeReviewItem} />;
  }

  return (
    <AppButton aria-label="Resume review" className="min-w-32 px-5" onClick={onResumeReviewItem} size="md" variant="primary">
      Resume
    </AppButton>
  );
}

export function ContinueReadingAction({ onContinueReading }: { onContinueReading: () => void }) {
  return (
    <AppButton aria-label="Continue reading" className="min-w-40 px-5" onClick={onContinueReading} size="md" variant="ghost">
      Continue reading
    </AppButton>
  );
}
