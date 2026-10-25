import { resolveNodeDesiredRetentionSetting, resolveNodeShortTermSetting } from '../../../../lib/core/review/nodeSettings.js';
import { normalizeScheduledCardDue } from '../../../../lib/core/review/reviewDayBoundary.js';
import type { SchedulerGradeInput } from '../../../../lib/core/review/types.js';
import type { NodeReviewProfile } from '../../nodes/model/nodeTypes';

import { isFsrsReviewItemNode, type ReviewItemNodeLike } from './reviewItemKind';
import {
  toNodeReviewProfile,
  toSchedulerCard,
  type ReviewGrade,
  type ReviewSchedulerAdapter,
  type SchedulerCard
} from './reviewTypes';

export type ReviewSchedulerVersionResolver = (
  overrides: Pick<SchedulerGradeInput, 'desiredRetention' | 'enableShortTerm'>
) => string;

type ReviewGradeNode = ReviewItemNodeLike & {
  desiredRetention?: number | null;
  enableShortTerm?: boolean | null;
  id: string;
  parentNodeId: string | null;
};

interface SharedReviewGradeLog {
  cardAfter: SchedulerCard;
  cardBefore: SchedulerCard;
  grade: ReviewGrade;
  reviewedAt: string;
  schedulerVersion: string;
}

export interface SharedReviewGradeResult {
  cardAfter: SchedulerCard;
  cardBefore: SchedulerCard;
  nextReviewProfile: NodeReviewProfile;
  nodePatch: {
    review: NodeReviewProfile;
  };
  reviewedAt: string;
  reviewLog: SharedReviewGradeLog;
  schedulerVersion: string;
}

export async function gradeSharedFsrsReviewNode(args: {
  getSchedulerVersion: ReviewSchedulerVersionResolver;
  grade: ReviewGrade;
  newDayStartsAtHour: number;
  nodeId: string;
  nodesById: Record<string, ReviewGradeNode | undefined>;
  now: string;
  scheduler: ReviewSchedulerAdapter;
}): Promise<SharedReviewGradeResult | null> {
  const node = args.nodesById[args.nodeId];
  if (!node || !isFsrsReviewItemNode(node)) {
    return null;
  }
  const cardBefore = toSchedulerCard(node.review, args.now);
  const enableShortTerm = resolveNodeShortTermSetting(args.nodeId, args.nodesById).value;
  const retention = resolveNodeDesiredRetentionSetting(args.nodeId, args.nodesById);
  const overrides = { enableShortTerm, ...(retention.source === 'default' ? {} : { desiredRetention: retention.value }) };
  const gradeResult = await args.scheduler.grade({
    card: cardBefore,
    ...overrides,
    grade: args.grade,
    now: args.now
  });
  const reviewedAt = gradeResult.reviewed_at;
  const cardAfter = normalizeScheduledCardDue({
    card: gradeResult.card,
    reviewedAt,
    newDayStartsAtHour: args.newDayStartsAtHour
  });
  const schedulerVersion = args.getSchedulerVersion(overrides);
  const nextReviewProfile = toNodeReviewProfile(cardAfter);
  return {
    cardAfter,
    cardBefore,
    nextReviewProfile,
    nodePatch: {
      review: {
        ...nextReviewProfile,
        lastReviewAt: reviewedAt
      }
    },
    reviewedAt,
    reviewLog: {
      cardAfter,
      cardBefore,
      grade: args.grade,
      reviewedAt,
      schedulerVersion
    },
    schedulerVersion
  };
}
