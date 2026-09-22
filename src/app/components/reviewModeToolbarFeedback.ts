import { useCallback, useEffect } from 'react';

import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { resetReadingReviewFeedback, submitReadingReviewFeedback, useReadingReviewFeedbackState } from '../hooks/readingReviewFeedbackState';
import { resetReviewGradeFeedback, submitReviewGradeFeedback, useReviewGradeFeedbackState } from '../hooks/reviewGradeFeedbackState';

export function useGradeFeedback(args: {
  isAnswerRevealed: boolean;
  onGrade: (grade: ReviewGrade) => Promise<boolean>;
  reviewCurrentNodeId: string | null;
}) {
  const feedback = useReviewGradeFeedbackState(args.reviewCurrentNodeId);
  useEffect(() => {
    resetReviewGradeFeedback();
    return resetReviewGradeFeedback;
  }, [args.isAnswerRevealed, args.reviewCurrentNodeId]);
  return {
    errorMessage: feedback.errorMessage,
    isSubmitting: feedback.isSubmitting,
    retryGrade: feedback.retryGrade,
    submitGrade: (grade: ReviewGrade) =>
      submitReviewGradeFeedback(args.reviewCurrentNodeId, () => args.onGrade(grade))
  };
}

export type ReadingReviewFeedbackAction = 'dismiss' | 'later' | 'read' | 'soon';

export function useReadingReviewFeedback(args: {
  isReadingActive: boolean;
  onDismissReviewTopic: () => Promise<boolean>;
  onPostponeReviewTopic: () => Promise<boolean>;
  onReadReviewTopic: () => Promise<boolean>;
  onRevisitReviewTopicSoon: () => Promise<boolean>;
  reviewCurrentNodeId: string | null;
}) {
  const { onDismissReviewTopic, onPostponeReviewTopic, onReadReviewTopic, onRevisitReviewTopicSoon } = args;
  const submitReadingAction = useCallback(
    (action: ReadingReviewFeedbackAction) => {
      if (action === 'soon') return onRevisitReviewTopicSoon();
      if (action === 'later') return onPostponeReviewTopic();
      if (action === 'read') return onReadReviewTopic();
      return onDismissReviewTopic();
    },
    [onDismissReviewTopic, onPostponeReviewTopic, onReadReviewTopic, onRevisitReviewTopicSoon]
  );
  const feedback = useReadingReviewFeedbackState(args.reviewCurrentNodeId);
  useEffect(() => {
    resetReadingReviewFeedback();
    return resetReadingReviewFeedback;
  }, [args.isReadingActive, args.reviewCurrentNodeId]);
  return {
    errorMessage: feedback.errorMessage,
    isSubmitting: feedback.isSubmitting,
    retryReadingAction: feedback.retryReadingAction,
    submitReadingAction: (action: ReadingReviewFeedbackAction) =>
      submitReadingReviewFeedback(args.reviewCurrentNodeId, () => submitReadingAction(action))
  };
}
