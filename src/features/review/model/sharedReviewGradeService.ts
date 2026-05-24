import { resolveNodeShortTermSetting } from '../../../../lib/core/review/nodeSettings.js';
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
  overrides: Pick<SchedulerGradeInput, 'enableShortTerm'>
) => string;

type ReviewGradeNode = ReviewItemNodeLike & {
  enableShortTerm?: boolean | null;
  id: string;
  parentNodeId: string | null;
};

export interface SharedReviewGradeLog {
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
    updatedAt: string;
  };
  reviewedAt: string;
  reviewLog: SharedReviewGradeLog;
  schedulerVersion: string;
}

export async function gradeSharedFsrsReviewNode(args: {
  getSchedulerVersion: ReviewSchedulerVersionResolver;
  grade: ReviewGrade;
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
  const gradeResult = await args.scheduler.grade({
    card: cardBefore,
    enableShortTerm,
    grade: args.grade,
    now: args.now
  });
  const cardAfter = gradeResult.card;
  const reviewedAt = gradeResult.reviewed_at;
  const schedulerVersion = args.getSchedulerVersion({ enableShortTerm });
  const nextReviewProfile = toNodeReviewProfile(cardAfter);
  return {
    cardAfter,
    cardBefore,
    nextReviewProfile,
    nodePatch: {
      review: {
        ...nextReviewProfile,
        lastReviewAt: reviewedAt
      },
      updatedAt: args.now
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
