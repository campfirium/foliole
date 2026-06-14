import { useCallback, useEffect, useState } from 'react';

import type { ReviewGrade } from '../../features/review/model/reviewTypes';

type ReviewActionSubmitter<T> = (action: T) => Promise<boolean>;

function useReviewActionFeedback<T>(args: {
  failureMessage: string;
  isActive: boolean;
  onSubmit: ReviewActionSubmitter<T>;
  resetKey: string | null;
}) {
  const { failureMessage, isActive, onSubmit, resetKey } = args;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedAction, setFailedAction] = useState<T | null>(null);
  useEffect(() => {
    if (!resetKey || !isActive) {
      setIsSubmitting(false);
      setErrorMessage(null);
      setFailedAction(null);
    }
  }, [isActive, resetKey]);

  const submitAction = useCallback(
    async (action: T) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
        const saved = await onSubmit(action);
        if (!saved) {
          setFailedAction(action);
          setErrorMessage(failureMessage);
          setIsSubmitting(false);
          return;
        }
        setFailedAction(null);
        setErrorMessage(null);
        setIsSubmitting(false);
      } catch {
        setFailedAction(action);
        setErrorMessage(failureMessage);
        setIsSubmitting(false);
      }
    },
    [failureMessage, isSubmitting, onSubmit]
  );

  const retryAction = useCallback(async () => {
    if (failedAction !== null) {
      await submitAction(failedAction);
    }
  }, [failedAction, submitAction]);

  return {
    errorMessage,
    isSubmitting,
    retryAction: failedAction !== null ? retryAction : undefined,
    submitAction
  };
}

export function useGradeFeedback(args: {
  isAnswerRevealed: boolean;
  onGrade: (grade: ReviewGrade) => Promise<boolean>;
  reviewCurrentNodeId: string | null;
}) {
  const feedback = useReviewActionFeedback({
    failureMessage: 'Failed to save grade. Please retry.',
    isActive: args.isAnswerRevealed,
    onSubmit: args.onGrade,
    resetKey: args.reviewCurrentNodeId
  });
  return {
    errorMessage: feedback.errorMessage,
    isSubmitting: feedback.isSubmitting,
    retryGrade: feedback.retryAction,
    submitGrade: feedback.submitAction
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
  const feedback = useReviewActionFeedback({
    failureMessage: 'Failed to save. Please retry.',
    isActive: args.isReadingActive,
    onSubmit: submitReadingAction,
    resetKey: args.reviewCurrentNodeId
  });
  return {
    errorMessage: feedback.errorMessage,
    isSubmitting: feedback.isSubmitting,
    retryReadingAction: feedback.retryAction,
    submitReadingAction: feedback.submitAction
  };
}
