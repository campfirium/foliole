import type { CSSProperties } from 'react';

import type { ReviewSessionMode, ReviewSessionModeAvailability } from '../../features/review/model/reviewSessionMode';
import type { ReviewGrade, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { useActionHelpCardsEnabled } from '../../shared/platform/actionHelpCards';
import { ReviewActionBar } from '../../shared/ui';

import { FsrsRevealAction, ReadingReviewActions, ReviewGradeActions } from './ReviewModeToolbarActions';
import type { ReadingReviewFeedbackAction } from './reviewModeToolbarFeedback';
import { ReviewSessionModeControl } from './ReviewSessionModeControl';
import type { ReviewToolbarProgressCounts } from './reviewToolbarProgressLabel';
import { ReviewToolbarProgressLine, ReviewToolbarSessionActions, type ReviewToolbarSessionSummary } from './ReviewToolbarSessionFrame';

export interface ActiveReviewActionBarProps {
  className?: string;
  errorMessage: string | null;
  isAnswerRevealed: boolean;
  isCurrentItemGradable: boolean;
  isReviewEditing: boolean;
  isSubmitting: boolean;
  onReadReviewTopic: () => Promise<boolean>;
  onPostponeReviewTopic: () => Promise<boolean>;
  onDismissReviewTopic: () => Promise<boolean>;
  onRevealAnswer: () => void;
  onSetReviewSessionMode: (mode: ReviewSessionMode) => void;
  onRevisitReviewTopicSoon: () => Promise<boolean>;
  readingErrorMessage: string | null;
  readingIsSubmitting: boolean;
  readActionAdvanceReady?: boolean;
  retryReadingAction?: () => Promise<void>;
  retryGrade?: () => Promise<void>;
  reviewPreview: SchedulerPreviewResult | null;
  reviewCompletedCount: number;
  reviewProgressCounts?: ReviewToolbarProgressCounts;
  reviewQueueCount: number;
  reviewSessionMode: ReviewSessionMode;
  reviewSessionModeAvailability?: ReviewSessionModeAvailability;
  reviewSummary?: ReviewToolbarSessionSummary;
  showProgress?: boolean;
  showSessionModeControl?: boolean;
  showSummary?: boolean;
  surface?: 'panel' | 'overlay';
  style?: CSSProperties;
  submitGrade: (grade: ReviewGrade) => Promise<void>;
  submitReadingAction: (action: ReadingReviewFeedbackAction) => Promise<void>;
}

function ActiveReviewProgress(props: Pick<
  ActiveReviewActionBarProps,
  'reviewCompletedCount' | 'reviewProgressCounts' | 'reviewQueueCount' | 'reviewSessionMode' | 'showProgress'
>) {
  if (!props.showProgress) return null;
  return (
    <ReviewToolbarProgressLine
      completedCount={props.reviewCompletedCount}
      {...definedProps({ progressCounts: props.reviewProgressCounts })}
      queueCount={props.reviewQueueCount}
      reviewSessionMode={props.reviewSessionMode}
    />
  );
}

function createActiveReviewActions(props: Pick<
  ActiveReviewActionBarProps,
  | 'errorMessage'
  | 'isAnswerRevealed'
  | 'isCurrentItemGradable'
  | 'isSubmitting'
  | 'onReadReviewTopic'
  | 'onPostponeReviewTopic'
  | 'onDismissReviewTopic'
  | 'onRevealAnswer'
  | 'readingErrorMessage'
  | 'readingIsSubmitting'
  | 'readActionAdvanceReady'
  | 'retryReadingAction'
  | 'retryGrade'
  | 'reviewPreview'
  | 'surface'
  | 'submitGrade'
  | 'submitReadingAction'
> & { showActionHelp: boolean }) {
  if (!props.isCurrentItemGradable) {
    return (
      <ReadingReviewActions
        errorMessage={props.readingErrorMessage}
        isSubmitting={props.readingIsSubmitting}
        onDismissReviewTopic={() => void props.submitReadingAction('dismiss')}
        onPostponeReviewTopic={() => void props.submitReadingAction('later')}
        onReadReviewTopic={() => void props.submitReadingAction('read')}
        onRevisitReviewTopicSoon={() => void props.submitReadingAction('soon')}
        readActionAdvanceReady={props.readActionAdvanceReady === true}
        {...definedProps({ onRetry: props.retryReadingAction })}
        showActionHelp={props.showActionHelp}
        {...definedProps({ surface: props.surface })}
      />
    );
  }
  if (!props.isAnswerRevealed) {
    return <FsrsRevealAction onRevealAnswer={props.onRevealAnswer} {...definedProps({ surface: props.surface })} />;
  }
  return (
      <ReviewGradeActions
        errorMessage={props.errorMessage}
        isSubmitting={props.isSubmitting}
        {...definedProps({ onRetry: props.retryGrade })}
        previewDueByGrade={{
          1: props.reviewPreview?.Again.card.due,
          2: props.reviewPreview?.Hard.card.due,
          3: props.reviewPreview?.Good.card.due,
          4: props.reviewPreview?.Easy.card.due
        }}
        showActionHelp={props.showActionHelp}
      {...definedProps({ surface: props.surface })}
      submitGrade={props.submitGrade}
    />
  );
}

function createActiveReviewPrimary(props: ActiveReviewActionBarProps, showActionHelp: boolean) {
  const actions = createActiveReviewActions({
    errorMessage: props.errorMessage,
    isAnswerRevealed: props.isAnswerRevealed,
    isCurrentItemGradable: props.isCurrentItemGradable,
    isSubmitting: props.isSubmitting,
    onReadReviewTopic: props.onReadReviewTopic,
    onPostponeReviewTopic: props.onPostponeReviewTopic,
    onDismissReviewTopic: props.onDismissReviewTopic,
    onRevealAnswer: props.onRevealAnswer,
    readingErrorMessage: props.readingErrorMessage,
    readingIsSubmitting: props.readingIsSubmitting,
    ...definedProps({ readActionAdvanceReady: props.readActionAdvanceReady }),
    ...definedProps({ retryReadingAction: props.retryReadingAction }),
    ...definedProps({ retryGrade: props.retryGrade }),
    reviewPreview: props.reviewPreview,
    showActionHelp,
    ...definedProps({ surface: props.surface }),
    submitGrade: props.submitGrade,
    submitReadingAction: props.submitReadingAction
  });
  if (!props.showSessionModeControl || (props.isCurrentItemGradable && !props.isAnswerRevealed)) {
    return actions;
  }
  if (!props.isCurrentItemGradable && (props.reviewProgressCounts?.queuedItemCount ?? 0) <= 0) {
    return (
      <ReviewToolbarSessionActions
        actions={actions}
        modeControl={<ReviewSessionModeControl {...definedProps({ availability: props.reviewSessionModeAvailability })} mode={props.reviewSessionMode} onChangeMode={props.onSetReviewSessionMode} />}
        {...definedProps({ surface: props.surface })}
        {...definedProps({ summary: props.reviewSummary ? { ...props.reviewSummary, status: 'clear' as const } : undefined })}
      />
    );
  }
  return (
    <ReviewToolbarSessionActions
      actions={actions}
      onSetReviewSessionMode={props.onSetReviewSessionMode}
      reviewSessionMode={props.reviewSessionMode}
      {...definedProps({ reviewSessionModeAvailability: props.reviewSessionModeAvailability })}
      {...definedProps({ surface: props.surface })}
      {...definedProps({ summary: props.reviewSummary })}
    />
  );
}

function createActiveReviewSecondary(props: ActiveReviewActionBarProps) {
  if (props.showSessionModeControl || !props.showSummary) return null;
  return `${Math.max(props.reviewQueueCount, 0)} left · ${Math.max(props.reviewCompletedCount, 0)} done`;
}

export function ActiveReviewActionBar(props: ActiveReviewActionBarProps) {
  const showActionHelp = useActionHelpCardsEnabled();
  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ className: props.className, style: props.style })}
      mode="study"
      primary={createActiveReviewPrimary(props, showActionHelp)}
      progress={
        <ActiveReviewProgress
          reviewCompletedCount={props.reviewCompletedCount}
          {...definedProps({ reviewProgressCounts: props.reviewProgressCounts })}
          reviewQueueCount={props.reviewQueueCount}
          reviewSessionMode={props.reviewSessionMode}
          showProgress={props.showProgress ?? true}
        />
      }
      reviewInputMode={props.isReviewEditing ? 'editing' : 'hotkeys'}
      reviewItemKind={props.isCurrentItemGradable ? 'fsrs' : 'reading'}
      secondary={createActiveReviewSecondary(props)}
      {...definedProps({ surface: props.surface })}
    />
  );
}
