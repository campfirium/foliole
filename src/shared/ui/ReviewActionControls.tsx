import type { ReactNode } from 'react';

import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { useTranslation } from '../localization/LocalizationProvider';
import type { TranslationKey } from '../localization/translations';

import { ActionHelpCard, type ActionHelpCardCopy } from './ActionHelpCard';
import { AppButton } from './Button';
import { REVIEW_GRADE_ACTION_HELP } from './reviewActionHelp';
import { overlayDividerClass, type ReviewActionSurface } from './reviewActionLayout';
import { renderOverlayDividedActions, ReviewOverlayActionButton } from './ReviewOverlayActionButton';
import { ToolbarActionGroup } from './ToolbarActionGroup';

export { ReadingReviewActions } from './ReadingReviewActions';
export type { ReviewActionSurface } from './reviewActionLayout';

const reviewGradeButtons = [
  { grade: 1, helpKey: 'again', labelKey: 'desktop.reviewActions.grade.again' },
  { grade: 2, helpKey: 'hard', labelKey: 'desktop.reviewActions.grade.hard' },
  { grade: 3, helpKey: 'good', labelKey: 'desktop.reviewActions.grade.good' },
  { grade: 4, helpKey: 'easy', labelKey: 'desktop.reviewActions.grade.easy' }
] as const satisfies ReadonlyArray<{ grade: ReviewGrade; helpKey: keyof typeof REVIEW_GRADE_ACTION_HELP; labelKey: TranslationKey }>;

function ReviewGradeButton(props: {
  buttonClassName?: string;
  buttonVariant: 'ghost' | 'default';
  disabled: boolean;
  grade: ReviewGrade;
  label: string;
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
  const t = useTranslation();

  if (!props.errorMessage) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <p aria-live="assertive" className="text-ui-sm text-error">
        {props.errorMessage}
      </p>
      {props.onRetry ? (
        <AppButton disabled={props.isSubmitting} onClick={props.onRetry} size="sm" variant="ghost">
          {t('desktop.reviewActions.retry')}
        </AppButton>
      ) : null}
    </div>
  );
}

export function ReviewGradeActions({
  buttonClassName,
  buttonVariant = 'default',
  errorMessage,
  groupClassName,
  isSubmitting,
  onRetry,
  showActionHelp = false,
  surface = 'panel',
  submitGrade
}: {
  buttonClassName?: string;
  buttonVariant?: 'ghost' | 'default';
  errorMessage: string | null;
  groupClassName?: string;
  isSubmitting: boolean;
  onRetry?: () => void;
  showActionHelp?: boolean;
  surface?: ReviewActionSurface;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}) {
  const t = useTranslation();
  const wrapWithHelpCard = (button: ReactNode, help: ActionHelpCardCopy) =>
    showActionHelp ? (
      <ActionHelpCard help={help} placement="above">
        {button}
      </ActionHelpCard>
    ) : button;
  return (
    <div className="flex items-center gap-2">
      <ToolbarActionGroup ariaLabel={t('desktop.reviewActions.grade.group')} className={groupClassName ?? `gap-2 ${overlayDividerClass(surface)}`}>
        {renderOverlayDividedActions(
          reviewGradeButtons.map((gradeButton) => ({
            key: String(gradeButton.grade),
            node: wrapWithHelpCard(
              <ReviewGradeButton
                {...(buttonClassName !== undefined ? { buttonClassName } : {})}
                buttonVariant={buttonVariant}
                disabled={isSubmitting}
                grade={gradeButton.grade}
                label={t(gradeButton.labelKey)}
                surface={surface}
                submitGrade={submitGrade}
              />,
              REVIEW_GRADE_ACTION_HELP[gradeButton.helpKey]
            )
          })),
          surface
        )}
      </ToolbarActionGroup>
      <ReviewGradeErrorFeedback errorMessage={errorMessage} isSubmitting={isSubmitting} {...(onRetry ? { onRetry } : {})} />
    </div>
  );
}

export function FsrsRevealAction({ disabled = false, onRevealAnswer }: { disabled?: boolean; onRevealAnswer: () => void }) {
  const t = useTranslation();

  return (
    <ToolbarActionGroup ariaLabel={t('desktop.reviewActions.reveal.group')} className="gap-2" data-review-toolbar-kind="fsrs-prompt">
      <AppButton aria-label={t('desktop.reviewActions.showAnswer')} className="min-w-32 px-5" disabled={disabled} onClick={onRevealAnswer} size="md" variant="default">
        {t('desktop.reviewActions.showAnswer')}
      </AppButton>
    </ToolbarActionGroup>
  );
}

export function ReviewCompleteAction({ onExitReviewMode }: { onExitReviewMode: () => void }) {
  const t = useTranslation();

  return (
    <AppButton aria-label={t('desktop.reviewActions.queueClear')} className="min-w-32 px-5" onClick={onExitReviewMode} size="md" variant="subtle">
      {t('desktop.reviewActions.queueClear')}
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
  const t = useTranslation();

  if (surface === 'overlay') {
    return <ReviewOverlayActionButton ariaLabel={t('desktop.reviewActions.resumeReview')} label={t('desktop.reviewActions.resume')} onClick={onResumeReviewItem} />;
  }

  return (
    <AppButton aria-label={t('desktop.reviewActions.resumeReview')} className="min-w-32 px-5" onClick={onResumeReviewItem} size="md" variant="default">
      {t('desktop.reviewActions.resume')}
    </AppButton>
  );
}

export function ContinueReadingAction({ onContinueReading }: { onContinueReading: () => void }) {
  const t = useTranslation();

  return (
    <AppButton aria-label={t('desktop.reviewActions.continueReading')} className="min-w-40 px-5" onClick={onContinueReading} size="md" variant="ghost">
      {t('desktop.reviewActions.continueReading')}
    </AppButton>
  );
}
