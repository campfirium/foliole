import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { ReviewActionBar } from '../../shared/ui';

import { ResumeReviewAction } from './ReviewModeToolbarActions';
import { ActiveReviewActionBar } from './ReviewModeToolbarActive';
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

function useGradeFeedback(onGrade: ReviewModeToolbarProps['onGrade'], reviewCurrentNodeId: string | null, isAnswerRevealed: boolean) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedGrade, setFailedGrade] = useState<ReviewGrade | null>(null);
  useEffect(() => {
    if (!reviewCurrentNodeId || !isAnswerRevealed) {
      setIsSubmitting(false);
      setErrorMessage(null);
      setFailedGrade(null);
    }
  }, [isAnswerRevealed, reviewCurrentNodeId]);

  const submitGrade = useCallback(
    async (grade: ReviewGrade) => {
      if (isSubmitting) {
        return;
      }
      setIsSubmitting(true);
      try {
        const graded = await onGrade(grade);
        if (!graded) {
          setFailedGrade(grade);
          setErrorMessage('Failed to save grade. Please retry.');
          setIsSubmitting(false);
          return;
        }
        setFailedGrade(null);
        setErrorMessage(null);
        setIsSubmitting(false);
      } catch {
        setFailedGrade(grade);
        setErrorMessage('Failed to save grade. Please retry.');
        setIsSubmitting(false);
      }
    },
    [isSubmitting, onGrade]
  );

  const retryGrade = useCallback(async () => {
    if (failedGrade) {
      await submitGrade(failedGrade);
    }
  }, [failedGrade, submitGrade]);

  return {
    errorMessage,
    isSubmitting,
    retryGrade: failedGrade ? retryGrade : undefined,
    submitGrade
  };
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
      primary={<ResumeReviewAction onResumeReviewItem={onResumeReviewItem} />}
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
  const feedback = useGradeFeedback(toolbarProps.onGrade, toolbarProps.reviewCurrentNodeId, toolbarProps.isAnswerRevealed);

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
      errorMessage={feedback.errorMessage}
      isSubmitting={feedback.isSubmitting}
      submitGrade={feedback.submitGrade}
      {...definedProps({ reviewSummary: withSummaryStatus(toolbarProps.reviewSummary, 'in-progress') })}
      {...definedProps({ retryGrade: feedback.retryGrade })}
    />
  );
}
