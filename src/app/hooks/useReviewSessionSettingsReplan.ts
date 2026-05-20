import { useEffect, useRef } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';

export function useReviewSessionSettingsReplan(args: {
  currentNodeId: string | null;
  nowIso: string;
  reviewSchedulerSettingsSignature: string;
  reviewSessionMode: ReviewSessionMode;
  setReviewSessionMode: (mode: ReviewSessionMode, now?: string) => void;
}) {
  const previousSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const previousSignature = previousSignatureRef.current;
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
    args.nowIso,
    args.reviewSchedulerSettingsSignature,
    args.reviewSessionMode,
    args.setReviewSessionMode
  ]);
}
