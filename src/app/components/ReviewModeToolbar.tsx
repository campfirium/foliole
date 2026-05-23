import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { ReviewActionBar } from '../../shared/ui';

import { ResumeReviewAction } from './ReviewModeToolbarActions';
import { ActiveReviewActionBar } from './ReviewModeToolbarActive';
import { ReviewNoCurrentItemBar } from './ReviewModeToolbarNoCurrent';
import { ReviewSessionProgress, type ReviewToolbarSessionSummaryStatus, type ReviewToolbarSessionSummaryValues } from './ReviewToolbarSessionFrame';

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
  reviewQueueCount: number;
  reviewSummary?: ReviewToolbarSessionSummaryValues;
  reviewStatus: 'idle' | 'awaiting-answer' | 'answer-revealed' | 'completed';
  reviewSessionMode: ReviewSessionMode;
  onGrade: (grade: ReviewGrade) => Promise<boolean>;
  onCompleteReviewItem: () => boolean;
  onDeferReviewItem: () => boolean;
  onDismissReviewItem: () => boolean;
  onSoonReviewItem: () => boolean;
  onContinueReading: () => void;
  onRevealAnswer: () => void;
  onExitReviewMode: () => void;
  onResumeReviewItem: () => void;
  onSetReviewSessionMode: (mode: ReviewSessionMode) => void;
  showProgress?: boolean;
  style?: CSSProperties;
}

function useGradeFeedback(
  onGrade: ReviewModeToolbarProps['onGrade'],
  reviewCurrentNodeId: string | null,
  isAnswerRevealed: boolean
) {
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

  return { errorMessage, isSubmitting, retryGrade: failedGrade ? retryGrade : undefined, submitGrade };
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
  reviewQueueCount,
  reviewSessionMode,
  showProgress = true,
  showSummary,
  style
}: Pick<
  ReviewModeToolbarProps,
  | 'className'
  | 'onResumeReviewItem'
  | 'reviewCompletedCount'
  | 'reviewCurrentTitle'
  | 'reviewQueueCount'
  | 'reviewSessionMode'
  | 'showProgress'
  | 'showSummary'
  | 'style'
>) {
  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ className, style })}
      mode="study"
      primary={<ResumeReviewAction onResumeReviewItem={onResumeReviewItem} />}
      progress={<ReviewSessionProgress reviewCompletedCount={reviewCompletedCount} reviewQueueCount={reviewQueueCount} reviewSessionMode={reviewSessionMode} showProgress={showProgress} />}
      secondary={showSummary ? <ReviewPausedSummary reviewCurrentTitle={reviewCurrentTitle} /> : null}
    />
  );
}

function withSummaryStatus(
  summary: ReviewToolbarSessionSummaryValues | undefined,
  status: ReviewToolbarSessionSummaryStatus
) {
  return summary ? { ...summary, status } : undefined;
}

export function ReviewModeToolbar(props: ReviewModeToolbarProps) {
  const toolbarProps = {
    ...props,
    showProgress: props.showProgress ?? true,
    showSessionModeControl: props.showSessionModeControl ?? false,
    showSummary: props.showSummary ?? true
  };
  const feedback = useGradeFeedback(
    toolbarProps.onGrade,
    toolbarProps.reviewCurrentNodeId,
    toolbarProps.isAnswerRevealed
  );

  if (!toolbarProps.isStudyMode) return null;

  if (!toolbarProps.reviewCurrentNodeId) {
    return (
      <ReviewNoCurrentItemBar
        {...definedProps({ className: toolbarProps.className, style: toolbarProps.style })}
        onContinueReading={toolbarProps.onContinueReading}
        onResumeReviewItem={toolbarProps.onResumeReviewItem}
        reviewCompletedCount={toolbarProps.reviewCompletedCount}
        reviewQueueCount={toolbarProps.reviewQueueCount}
        reviewSummary={withSummaryStatus(
          toolbarProps.reviewSummary,
          toolbarProps.reviewStatus === 'completed' ? 'clear' : 'not-started'
        )}
        reviewStatus={toolbarProps.reviewStatus}
        showSummary={toolbarProps.showSummary}
      />
    );
  }

  if (!toolbarProps.isCurrentReviewItemVisible) {
    return <PausedReviewActionBar {...toolbarProps} />;
  }

  return (
    <ActiveReviewActionBar
      {...toolbarProps}
      errorMessage={feedback.errorMessage}
      isSubmitting={feedback.isSubmitting}
      reviewSummary={withSummaryStatus(toolbarProps.reviewSummary, 'in-progress')}
      submitGrade={feedback.submitGrade}
      {...definedProps({ retryGrade: feedback.retryGrade })}
    />
  );
}
