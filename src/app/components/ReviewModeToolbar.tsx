import type { CSSProperties } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import type { ReviewGrade, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { ReviewActionBar } from '../../shared/ui';

import { ResumeReviewAction } from './ReviewModeToolbarActions';
import { ActiveReviewActionBar } from './ReviewModeToolbarActive';
import { useGradeFeedback, useReadingReviewFeedback } from './reviewModeToolbarFeedback';
import { ReviewNoCurrentItemBar } from './ReviewModeToolbarNoCurrent';
import type { ReviewToolbarProgressCounts } from './reviewToolbarProgressLabel';
import {
  ReviewSessionProgress,
  type ReviewToolbarSessionSummaryStatus,
  type ReviewToolbarSessionSummaryValues
} from './ReviewToolbarSessionFrame';

interface ReviewModeToolbarProps {
  className?: string;
  showSessionModeControl?: boolean;
  showSummary?: boolean;
  isStudyMode: boolean;
  isAnswerRevealed: boolean;
  isCurrentItemGradable: boolean;
  isCurrentReviewItemVisible: boolean;
  isReviewEditing: boolean;
  reviewCompletedCount: number;
  reviewCurrentNodeId: string | null;
  reviewCurrentTitle: string | undefined;
  reviewProgressCounts?: ReviewToolbarProgressCounts;
  reviewPreview: SchedulerPreviewResult | null;
  reviewQueueCount: number;
  reviewSummary?: ReviewToolbarSessionSummaryValues;
  reviewStatus: 'idle' | 'awaiting-answer' | 'answer-revealed' | 'completed';
  reviewSessionMode: ReviewSessionMode;
  surface?: 'panel' | 'overlay';
  onGrade: (grade: ReviewGrade) => Promise<boolean>;
  onReadReviewTopic: () => Promise<boolean>;
  onPostponeReviewTopic: () => Promise<boolean>;
  onDismissReviewTopic: () => Promise<boolean>;
  onRevisitReviewTopicSoon: () => Promise<boolean>;
  onContinueReading: () => void;
  onRevealAnswer: () => void;
  onExitReviewMode: () => void;
  onResumeReviewItem: () => void;
  onSetReviewSessionMode: (mode: ReviewSessionMode) => void;
  showProgress?: boolean;
  style?: CSSProperties;
}

function ReviewPausedSummary({ reviewCurrentTitle }: Pick<ReviewModeToolbarProps, 'reviewCurrentTitle'>) {
  const title = reviewCurrentTitle?.trim();
  return title ? `Review paused · ${title}` : 'Review paused';
}

function PausedReviewActionBar({
  className,
  onResumeReviewItem,
  reviewCompletedCount,
  reviewCurrentTitle,
  reviewProgressCounts,
  reviewQueueCount,
  reviewSessionMode,
  showProgress = true,
  showSummary,
  surface,
  style
}: Pick<
  ReviewModeToolbarProps,
  | 'className'
  | 'onResumeReviewItem'
  | 'reviewCompletedCount'
  | 'reviewCurrentTitle'
  | 'reviewProgressCounts'
  | 'reviewQueueCount'
  | 'reviewSessionMode'
  | 'showProgress'
  | 'showSummary'
  | 'surface'
  | 'style'
>) {
  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ className, style })}
      mode="study"
      primary={<ResumeReviewAction onResumeReviewItem={onResumeReviewItem} {...definedProps({ surface })} />}
      progress={
        <ReviewSessionProgress
          {...definedProps({ progressCounts: reviewProgressCounts })}
          reviewCompletedCount={reviewCompletedCount}
          reviewQueueCount={reviewQueueCount}
          reviewSessionMode={reviewSessionMode}
          showProgress={showProgress}
        />
      }
      secondary={showSummary ? <ReviewPausedSummary reviewCurrentTitle={reviewCurrentTitle} /> : null}
      {...definedProps({ surface })}
    />
  );
}

function withSummaryStatus(summary: ReviewToolbarSessionSummaryValues | undefined, status: ReviewToolbarSessionSummaryStatus) {
  return summary ? { ...summary, status } : undefined;
}

function omitReviewSummary<T extends { reviewSummary?: unknown }>(props: T) {
  const { reviewSummary, ...rest } = props;
  void reviewSummary;
  return rest;
}

export function ReviewModeToolbar(props: ReviewModeToolbarProps) {
  const toolbarProps = {
    ...props,
    showProgress: props.showProgress ?? true,
    showSessionModeControl: props.showSessionModeControl ?? false,
    showSummary: props.showSummary ?? true
  };
  const gradeFeedback = useGradeFeedback({
    isAnswerRevealed: toolbarProps.isAnswerRevealed,
    onGrade: toolbarProps.onGrade,
    reviewCurrentNodeId: toolbarProps.reviewCurrentNodeId
  });
  const readingFeedback = useReadingReviewFeedback({
    isReadingActive: !toolbarProps.isCurrentItemGradable && toolbarProps.isCurrentReviewItemVisible,
    onDismissReviewTopic: toolbarProps.onDismissReviewTopic,
    onPostponeReviewTopic: toolbarProps.onPostponeReviewTopic,
    onReadReviewTopic: toolbarProps.onReadReviewTopic,
    reviewCurrentNodeId: toolbarProps.reviewCurrentNodeId
  });

  if (!toolbarProps.isStudyMode) return null;

  if (!toolbarProps.reviewCurrentNodeId) {
    return (
      <ReviewNoCurrentItemBar
        {...definedProps({ className: toolbarProps.className, style: toolbarProps.style })}
        onContinueReading={toolbarProps.onContinueReading}
        onResumeReviewItem={toolbarProps.onResumeReviewItem}
        reviewCompletedCount={toolbarProps.reviewCompletedCount}
        {...definedProps({ reviewProgressCounts: toolbarProps.reviewProgressCounts })}
        reviewQueueCount={toolbarProps.reviewQueueCount}
        {...definedProps({
          reviewSummary: withSummaryStatus(toolbarProps.reviewSummary, toolbarProps.reviewStatus === 'completed' ? 'clear' : 'not-started')
        })}
        reviewStatus={toolbarProps.reviewStatus}
        showSummary={toolbarProps.showSummary}
        {...definedProps({ surface: toolbarProps.surface })}
      />
    );
  }

  if (!toolbarProps.isCurrentReviewItemVisible) {
    return <PausedReviewActionBar {...toolbarProps} />;
  }

  const activeToolbarProps = omitReviewSummary(toolbarProps);
  return (
    <ActiveReviewActionBar
      {...activeToolbarProps}
      errorMessage={gradeFeedback.errorMessage}
      isSubmitting={gradeFeedback.isSubmitting}
      readingErrorMessage={readingFeedback.errorMessage}
      readingIsSubmitting={readingFeedback.isSubmitting}
      submitGrade={gradeFeedback.submitGrade}
      submitReadingAction={readingFeedback.submitReadingAction}
      {...definedProps({ reviewSummary: withSummaryStatus(toolbarProps.reviewSummary, 'in-progress') })}
      {...definedProps({ retryGrade: gradeFeedback.retryGrade })}
      {...definedProps({ retryReadingAction: readingFeedback.retryReadingAction })}
    />
  );
}
