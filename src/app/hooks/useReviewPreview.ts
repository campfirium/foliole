import { useEffect, useMemo, useRef, useState } from 'react';

import { normalizeScheduledCardDue } from '../../../lib/core/review/reviewDayBoundary.js';
import { resolveNodeShortTermSetting } from '../../features/nodes/model/nodeReviewSettings';
import type { NodeReviewProfile } from '../../features/nodes/model/nodeTypes';
import { createReviewSchedulerAdapter } from '../../features/review/model/reviewSchedulerFactory';
import { toSchedulerCard, type SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import { getCurrentReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';

interface UseReviewPreviewArgs {
  currentNodeId: string | null;
  nodesById: Record<string, { enableShortTerm?: boolean | null; parentNodeId: string | null } | undefined>;
  isAnswerRevealed: boolean;
  isReviewSchedulerSettingsReady: boolean;
  isStudyMode: boolean;
  previewSeed: string;
  reviewProfile: NodeReviewProfile | null;
}

function buildCardSignature(reviewProfile: NodeReviewProfile | null) {
  if (!reviewProfile) {
    return 'empty';
  }
  return [
    reviewProfile.due,
    reviewProfile.lastReviewAt ?? 'null',
    reviewProfile.state,
    reviewProfile.stability,
    reviewProfile.difficulty,
    reviewProfile.elapsedDays,
    reviewProfile.scheduledDays,
    reviewProfile.reps,
    reviewProfile.lapses
  ].join('|');
}

function normalizePreviewDue(result: SchedulerPreviewResult, newDayStartsAtHour: number): SchedulerPreviewResult {
  return {
    Again: {
      ...result.Again,
      card: normalizeScheduledCardDue({ card: result.Again.card, reviewedAt: result.Again.reviewed_at, newDayStartsAtHour })
    },
    Hard: {
      ...result.Hard,
      card: normalizeScheduledCardDue({ card: result.Hard.card, reviewedAt: result.Hard.reviewed_at, newDayStartsAtHour })
    },
    Good: {
      ...result.Good,
      card: normalizeScheduledCardDue({ card: result.Good.card, reviewedAt: result.Good.reviewed_at, newDayStartsAtHour })
    },
    Easy: {
      ...result.Easy,
      card: normalizeScheduledCardDue({ card: result.Easy.card, reviewedAt: result.Easy.reviewed_at, newDayStartsAtHour })
    }
  };
}

export function useReviewPreview(args: UseReviewPreviewArgs): SchedulerPreviewResult | null {
  const [preview, setPreview] = useState<SchedulerPreviewResult | null>(null);
  const scheduler = useMemo(() => createReviewSchedulerAdapter(), []);
  const requestKeyRef = useRef('');
  const cardSignature = buildCardSignature(args.reviewProfile);
  const enableShortTerm = args.currentNodeId
    ? resolveNodeShortTermSetting(args.currentNodeId, args.nodesById).value
    : false;

  useEffect(() => {
    if (!args.isReviewSchedulerSettingsReady || !args.isStudyMode || !args.isAnswerRevealed || !args.currentNodeId) {
      requestKeyRef.current = '';
      setPreview(null);
      return;
    }

    const now = new Date().toISOString();
    const card = toSchedulerCard(args.reviewProfile, now);
    const requestKey = `${args.currentNodeId}:${args.previewSeed}:${enableShortTerm ? 'st1' : 'st0'}:${cardSignature}`;
    if (requestKeyRef.current === requestKey) {
      return;
    }
    requestKeyRef.current = requestKey;
    setPreview(null);

    let isActive = true;
    void scheduler
      .preview({ card, enableShortTerm, now })
      .then((result) => {
        if (isActive) {
          setPreview(normalizePreviewDue(result, getCurrentReviewSchedulerSettings().newDayStartsAtHour));
        }
      })
      .catch(() => {
        if (isActive) {
          setPreview(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, [args.currentNodeId, args.isAnswerRevealed, args.isReviewSchedulerSettingsReady, args.isStudyMode, args.previewSeed, args.reviewProfile, cardSignature, enableShortTerm, scheduler]);

  return preview;
}
