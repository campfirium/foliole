import type { ReactNode } from 'react';

import { ActionHelpCard, type ActionHelpCardCopy } from './ActionHelpCard';
import { AppButton } from './Button';
import { READING_REVIEW_ACTION_HELP } from './reviewActionHelp';
import { overlayDividerClass, type ReviewActionSurface } from './reviewActionLayout';
import { renderOverlayDividedActions, ReviewOverlayActionButton } from './ReviewOverlayActionButton';
import { ToolbarActionGroup } from './ToolbarActionGroup';

type ReviewActionItem = { key: string; node: ReactNode };
type ReadingReviewActionLabel = 'Soon' | 'Later' | 'Read' | 'Dismiss';

function ReadingReviewButton(props: {
  className: string;
  label: ReadingReviewActionLabel;
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

type ReadingReviewActionsProps = {
  actionButtonClassName?: string;
  groupClassName?: string;
  onReadReviewTopic: () => void;
  onPostponeReviewTopic: () => void;
  onDismissReviewTopic: () => void;
  onRevisitReviewTopicSoon?: () => void;
  showActionHelp?: boolean;
  surface?: ReviewActionSurface;
};

type ResolvedReadingReviewActionsProps = Required<
  Pick<ReadingReviewActionsProps, 'onDismissReviewTopic' | 'onPostponeReviewTopic' | 'onReadReviewTopic' | 'showActionHelp' | 'surface'>
> & {
  buttonClassName: string;
  onRevisitReviewTopicSoon?: () => void;
};

function createReadingReviewActionItems(props: ResolvedReadingReviewActionsProps) {
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
            <ReadingReviewButton className={props.buttonClassName} label="Soon" onClick={props.onRevisitReviewTopicSoon} surface={props.surface} />,
            READING_REVIEW_ACTION_HELP.soon
          )
        }
      : null,
    {
      key: 'later',
      node: wrapWithHelpCard(
        <ReadingReviewButton className={props.buttonClassName} label="Later" onClick={props.onPostponeReviewTopic} surface={props.surface} />,
        READING_REVIEW_ACTION_HELP.later
      )
    },
    {
      key: 'read',
      node: wrapWithHelpCard(
        <ReadingReviewButton className={props.buttonClassName} label="Read" onClick={props.onReadReviewTopic} surface={props.surface} />,
        READING_REVIEW_ACTION_HELP.read
      )
    },
    {
      key: 'dismiss',
      node: wrapWithHelpCard(
        <ReadingReviewButton className={props.buttonClassName} label="Dismiss" onClick={props.onDismissReviewTopic} surface={props.surface} />,
        READING_REVIEW_ACTION_HELP.dismiss
      )
    }
  ];
  return maybeReadingActions.filter((action): action is ReviewActionItem => action !== null);
}

export function ReadingReviewActions(props: ReadingReviewActionsProps) {
  const surface = props.surface ?? 'panel';
  const readingActions = createReadingReviewActionItems({
    buttonClassName: props.actionButtonClassName ?? 'min-w-20 border-border px-4',
    onDismissReviewTopic: props.onDismissReviewTopic,
    onPostponeReviewTopic: props.onPostponeReviewTopic,
    onReadReviewTopic: props.onReadReviewTopic,
    ...(props.onRevisitReviewTopicSoon ? { onRevisitReviewTopicSoon: props.onRevisitReviewTopicSoon } : {}),
    showActionHelp: props.showActionHelp ?? false,
    surface
  });
  return (
    <ToolbarActionGroup ariaLabel="Reading review actions" className={props.groupClassName ?? `gap-2 ${overlayDividerClass(surface)}`} data-review-toolbar-kind="reading">
      {renderOverlayDividedActions(readingActions, surface)}
    </ToolbarActionGroup>
  );
}
