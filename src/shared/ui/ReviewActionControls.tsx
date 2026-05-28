import type { ReactNode } from 'react';

import type { ReviewGrade } from '../../features/review/model/reviewTypes';

import { AppButton } from './Button';
import { renderOverlayDividedActions, ReviewOverlayActionButton } from './ReviewOverlayActionButton';
import { ToolbarActionGroup } from './ToolbarActionGroup';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from './Tooltip';

export type ReviewActionSurface = 'panel' | 'overlay';
type ReviewActionItem = { key: string; node: ReactNode };

function overlayDividerClass(surface: ReviewActionSurface) {
  return surface === 'overlay'
    ? 'gap-0 border-0 [&_button]:!rounded-none [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!shadow-none'
    : '';
}

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
  surface = 'panel',
  submitGrade
}: {
  buttonClassName?: string;
  buttonVariant?: 'ghost' | 'primary';
  errorMessage: string | null;
  groupClassName?: string;
  isSubmitting: boolean;
  onRetry?: () => void;
  surface?: ReviewActionSurface;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2">
      <ToolbarActionGroup ariaLabel="Review grade actions" className={groupClassName ?? `gap-2 ${overlayDividerClass(surface)}`}>
        {renderOverlayDividedActions(
          reviewGradeButtons.map((gradeButton) => ({
            key: String(gradeButton.grade),
            node: (
              <ReviewGradeButton
                {...(buttonClassName !== undefined ? { buttonClassName } : {})}
                buttonVariant={buttonVariant}
                disabled={isSubmitting}
                grade={gradeButton.grade}
                label={gradeButton.label}
                surface={surface}
                submitGrade={submitGrade}
              />
            )
          })),
          surface
        )}
      </ToolbarActionGroup>
      <ReviewGradeErrorFeedback errorMessage={errorMessage} isSubmitting={isSubmitting} {...(onRetry ? { onRetry } : {})} />
    </div>
  );
}

function ReadingReviewButton(props: {
  className: string;
  label: 'Soon' | 'Later' | 'Read' | 'Dismiss';
  onClick: () => void;
  surface: ReviewActionSurface;
}) {
  if (props.surface === 'overlay') {
    return <ReviewOverlayActionButton label={props.label} onClick={props.onClick} />;
  }

  return (
    <AppButton aria-label={props.label} className={props.className} onClick={props.onClick} size="md" variant="primary">
      {props.label}
    </AppButton>
  );
}

export function ReadingReviewActions({
  actionButtonClassName,
  groupClassName,
  onReadReviewTopic,
  onPostponeReviewTopic,
  onDismissReviewTopic,
  onRevisitReviewTopicSoon,
  surface = 'panel'
}: {
  actionButtonClassName?: string;
  groupClassName?: string;
  onReadReviewTopic: () => void;
  onPostponeReviewTopic: () => void;
  onDismissReviewTopic: () => void;
  onRevisitReviewTopicSoon?: () => void;
  surface?: ReviewActionSurface;
}) {
  const buttonClassName = actionButtonClassName ?? 'min-w-20 border-border px-4';
  const wrapWithTooltip = (button: ReactNode, tooltip: string) => (
    <AppTooltip>
      <AppTooltipTrigger asChild>{button}</AppTooltipTrigger>
      <AppTooltipContent>{tooltip}</AppTooltipContent>
    </AppTooltip>
  );
  const maybeReadingActions: Array<ReviewActionItem | null> = [
    onRevisitReviewTopicSoon
      ? {
          key: 'soon',
          node: wrapWithTooltip(<ReadingReviewButton className={buttonClassName} label="Soon" onClick={onRevisitReviewTopicSoon} surface={surface} />, 'Appears again after this queue.')
        }
      : null,
    {
      key: 'later',
      node: wrapWithTooltip(<ReadingReviewButton className={buttonClassName} label="Later" onClick={onPostponeReviewTopic} surface={surface} />, 'Appears again after a shorter interval.')
    },
    {
      key: 'read',
      node: wrapWithTooltip(<ReadingReviewButton className={buttonClassName} label="Read" onClick={onReadReviewTopic} surface={surface} />, 'Appears again after its normal interval.')
    },
    {
      key: 'dismiss',
      node: wrapWithTooltip(<ReadingReviewButton className={buttonClassName} label="Dismiss" onClick={onDismissReviewTopic} surface={surface} />, 'No longer appears.')
    }
  ];
  const readingActions = maybeReadingActions.filter((action): action is ReviewActionItem => action !== null);
  return (
    <ToolbarActionGroup ariaLabel="Reading review actions" className={groupClassName ?? `gap-2 ${overlayDividerClass(surface)}`} data-review-toolbar-kind="reading">
      {renderOverlayDividedActions(readingActions, surface)}
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
    <AppButton aria-label="Queue clear" className="min-w-32 px-5" onClick={onExitReviewMode} size="md" variant="subtle">
      Queue clear
    </AppButton>
  );
}

export function ResumeReviewAction({ onResumeReviewItem }: { onResumeReviewItem: () => void }) {
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
