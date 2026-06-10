import type { ReactNode } from 'react';

import { useTranslation } from '../localization/LocalizationProvider';

import { ActionHelpCard, type ActionHelpCardCopy } from './ActionHelpCard';
import { AppButton } from './Button';
import { ReviewActionFeedback } from './ReviewActionFeedback';
import { READING_REVIEW_ACTION_HELP } from './reviewActionHelp';
import { overlayDividerClass, type ReviewActionSurface } from './reviewActionLayout';
import { renderOverlayDividedActions, ReviewOverlayActionButton } from './ReviewOverlayActionButton';
import { ToolbarActionGroup } from './ToolbarActionGroup';

type ReviewActionItem = { key: string; node: ReactNode };

function ReadingReviewButton(props: {
  className: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
  surface: ReviewActionSurface;
}) {
  if (props.surface === 'overlay') {
    return <ReviewOverlayActionButton disabled={props.disabled} label={props.label} onClick={props.onClick} />;
  }

  return (
    <AppButton aria-label={props.label} className={props.className} disabled={props.disabled} onClick={props.onClick} size="md" variant="default">
      {props.label}
    </AppButton>
  );
}

type ReadingReviewActionsProps = {
  actionButtonClassName?: string;
  errorMessage?: string | null;
  groupClassName?: string;
  isSubmitting?: boolean;
  onReadReviewTopic: () => void;
  onPostponeReviewTopic: () => void;
  onDismissReviewTopic: () => void;
  onRetry?: () => void;
  onRevisitReviewTopicSoon?: () => void;
  showActionHelp?: boolean;
  surface?: ReviewActionSurface;
};

type ResolvedReadingReviewActionsProps = Required<
  Pick<ReadingReviewActionsProps, 'onDismissReviewTopic' | 'onPostponeReviewTopic' | 'onReadReviewTopic' | 'showActionHelp' | 'surface'>
> & {
  buttonClassName: string;
  isSubmitting: boolean;
  onRevisitReviewTopicSoon?: () => void;
};

function createReadingReviewActionItems(props: ResolvedReadingReviewActionsProps) {
  const t = useTranslation();
  const wrapWithHelpCard = (button: ReactNode, help: ActionHelpCardCopy) =>
    props.showActionHelp ? (
      <ActionHelpCard help={help} placement="above">
        {button}
      </ActionHelpCard>
    ) : button;
  const maybeReadingActions: Array<ReviewActionItem | null> = [
    props.onRevisitReviewTopicSoon
      ? {
          key: 'soon',
          node: wrapWithHelpCard(
            <ReadingReviewButton className={props.buttonClassName} disabled={props.isSubmitting} label={t('desktop.reviewActions.reading.soon')} onClick={props.onRevisitReviewTopicSoon} surface={props.surface} />,
            READING_REVIEW_ACTION_HELP.soon
          )
        }
      : null,
    {
      key: 'later',
      node: wrapWithHelpCard(
        <ReadingReviewButton className={props.buttonClassName} disabled={props.isSubmitting} label={t('desktop.reviewActions.reading.later')} onClick={props.onPostponeReviewTopic} surface={props.surface} />,
        READING_REVIEW_ACTION_HELP.later
      )
    },
    {
      key: 'read',
      node: wrapWithHelpCard(
        <ReadingReviewButton className={props.buttonClassName} disabled={props.isSubmitting} label={t('desktop.reviewActions.reading.read')} onClick={props.onReadReviewTopic} surface={props.surface} />,
        READING_REVIEW_ACTION_HELP.read
      )
    },
    {
      key: 'dismiss',
      node: wrapWithHelpCard(
        <ReadingReviewButton className={props.buttonClassName} disabled={props.isSubmitting} label={t('desktop.reviewActions.reading.dismiss')} onClick={props.onDismissReviewTopic} surface={props.surface} />,
        READING_REVIEW_ACTION_HELP.dismiss
      )
    }
  ];
  return maybeReadingActions.filter((action): action is ReviewActionItem => action !== null);
}

export function ReadingReviewActions(props: ReadingReviewActionsProps) {
  const t = useTranslation();
  const surface = props.surface ?? 'panel';
  const readingActions = createReadingReviewActionItems({
    buttonClassName: props.actionButtonClassName ?? 'min-w-20 border-border px-4',
    isSubmitting: props.isSubmitting ?? false,
    onDismissReviewTopic: props.onDismissReviewTopic,
    onPostponeReviewTopic: props.onPostponeReviewTopic,
    onReadReviewTopic: props.onReadReviewTopic,
    ...(props.onRevisitReviewTopicSoon ? { onRevisitReviewTopicSoon: props.onRevisitReviewTopicSoon } : {}),
    showActionHelp: props.showActionHelp ?? false,
    surface
  });
  return (
    <div className="flex items-center gap-2">
      <ToolbarActionGroup ariaLabel={t('desktop.reviewActions.reading.group')} className={props.groupClassName ?? `gap-2 ${overlayDividerClass(surface)}`} data-review-toolbar-kind="reading">
        {renderOverlayDividedActions(readingActions, surface)}
      </ToolbarActionGroup>
      <ReviewActionFeedback errorMessage={props.errorMessage ?? null} isSubmitting={props.isSubmitting ?? false} {...(props.onRetry ? { onRetry: props.onRetry } : {})} />
    </div>
  );
}
