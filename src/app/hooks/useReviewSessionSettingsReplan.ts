import { useEffect, useRef } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import { getDemoRuntimeNowIso } from '../../shared/platform/runtime/demoRuntime';

export function useReviewSessionSettingsReplan(args: {
  currentNodeId: string | null;
  isReviewSchedulerSettingsReady: boolean;
  reviewSchedulerSettingsSignature: string;
  reviewSessionMode: ReviewSessionMode;
  setReviewSessionMode: (mode: ReviewSessionMode, now?: string) => void;
}) {
  const previousSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const previousSignature = previousSignatureRef.current;
    if (!args.isReviewSchedulerSettingsReady) {
      if (previousSignature === null) {
        previousSignatureRef.current = args.reviewSchedulerSettingsSignature;
      }
      return;
    }
    previousSignatureRef.current = args.reviewSchedulerSettingsSignature;
    if (previousSignature === null || previousSignature === args.reviewSchedulerSettingsSignature) {
      return;
    }
    if (!args.currentNodeId) {
      return;
    }
    args.setReviewSessionMode(args.reviewSessionMode, getDemoRuntimeNowIso());
  }, [
    args.currentNodeId,
    args.isReviewSchedulerSettingsReady,
    args.reviewSchedulerSettingsSignature,
    args.reviewSessionMode,
    args.setReviewSessionMode
  ]);
}
