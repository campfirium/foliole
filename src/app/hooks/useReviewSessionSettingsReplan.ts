import { useEffect, useRef } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';

export function useReviewSessionSettingsReplan(args: {
  currentNodeId: string | null;
  isReviewSchedulerSettingsReady: boolean;
  nowIso: string;
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
    args.setReviewSessionMode(args.reviewSessionMode, args.nowIso);
  }, [
    args.currentNodeId,
    args.isReviewSchedulerSettingsReady,
    args.nowIso,
    args.reviewSchedulerSettingsSignature,
    args.reviewSessionMode,
    args.setReviewSessionMode
  ]);
}
