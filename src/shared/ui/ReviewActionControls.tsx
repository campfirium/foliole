import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { useTranslation } from '../localization/LocalizationProvider';
import type { TranslationKey } from '../localization/translations';

import { ActionHelpCard } from './ActionHelpCard';
import { AppButton } from './Button';
import { ReviewActionFeedback } from './ReviewActionFeedback';
import { REVIEW_GRADE_ACTION_HELP } from './reviewActionHelp';
import { overlayDividerClass, type ReviewActionSurface } from './reviewActionLayout';
import { formatReviewGradePreviewDue, ReviewGradePreviewTooltip } from './ReviewGradePreviewTooltip';
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
  dueLabel?: string | undefined;
  grade: ReviewGrade;
  label: string;
  surface: ReviewActionSurface;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}) {
  if (props.surface === 'overlay') {
    return (
      <ReviewOverlayActionButton
        disabled={props.disabled}
        label={props.label}
        onClick={() => void props.submitGrade(props.grade)}
        title={props.dueLabel}
      />
    );
  }

  return (
    <AppButton
      aria-label={props.label}
      className={props.buttonClassName ?? 'min-w-24 px-4'}
      disabled={props.disabled}
      onClick={() => void props.submitGrade(props.grade)}
      size="md"
      title={props.dueLabel}
      variant={props.buttonVariant}
    >
      {props.label}
    </AppButton>
  );
}

interface ReviewGradeActionsProps {
  buttonClassName?: string;
  buttonVariant?: 'ghost' | 'default';
  errorMessage: string | null;
  groupClassName?: string;
  isSubmitting: boolean;
  onRetry?: () => void;
  previewDueByGrade?: Partial<Record<ReviewGrade, string | undefined>>;
  showActionHelp?: boolean;
  surface?: ReviewActionSurface;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
}

function createReviewGradeActionNode(args: {
  buttonClassName?: string;
  buttonVariant: 'ghost' | 'default';
  dueLabel?: string | undefined;
  gradeButton: (typeof reviewGradeButtons)[number];
  isSubmitting: boolean;
  showActionHelp: boolean;
  surface: ReviewActionSurface;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
  t: ReturnType<typeof useTranslation>;
}) {
  const button = (
    <ReviewGradePreviewTooltip dueLabel={args.dueLabel}>
      <ReviewGradeButton
        {...(args.buttonClassName !== undefined ? { buttonClassName: args.buttonClassName } : {})}
        buttonVariant={args.buttonVariant}
        disabled={args.isSubmitting}
        dueLabel={args.dueLabel}
        grade={args.gradeButton.grade}
        label={args.t(args.gradeButton.labelKey)}
        surface={args.surface}
        submitGrade={args.submitGrade}
      />
    </ReviewGradePreviewTooltip>
  );
  return args.showActionHelp ? (
    <ActionHelpCard help={REVIEW_GRADE_ACTION_HELP[args.gradeButton.helpKey]} placement="above">
      {button}
    </ActionHelpCard>
  ) : button;
}

export function ReviewGradeActions({
  buttonClassName,
  buttonVariant = 'default',
  errorMessage,
  groupClassName,
  isSubmitting,
  onRetry,
  previewDueByGrade,
  showActionHelp = false,
  surface = 'panel',
  submitGrade
}: ReviewGradeActionsProps) {
  const t = useTranslation();
  const getDueLabel = (grade: ReviewGrade) => {
    const due = formatReviewGradePreviewDue(previewDueByGrade?.[grade]);
    return due ? t('desktop.reviewActions.grade.nextDue', { due }) : undefined;
  };
  return (
    <div className="flex items-center gap-2">
      <ToolbarActionGroup ariaLabel={t('desktop.reviewActions.grade.group')} className={groupClassName ?? `gap-2 ${overlayDividerClass(surface)}`}>
        {renderOverlayDividedActions(
          reviewGradeButtons.map((gradeButton) => ({
            key: String(gradeButton.grade),
            node: createReviewGradeActionNode({
              ...(buttonClassName !== undefined ? { buttonClassName } : {}),
              buttonVariant,
              dueLabel: getDueLabel(gradeButton.grade),
              gradeButton,
              isSubmitting,
              showActionHelp,
              surface,
              submitGrade,
              t
            })
          })),
          surface
        )}
      </ToolbarActionGroup>
      <ReviewActionFeedback errorMessage={errorMessage} isSubmitting={isSubmitting} {...(onRetry ? { onRetry } : {})} />
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
