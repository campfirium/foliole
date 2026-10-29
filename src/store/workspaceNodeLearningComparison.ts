import { sameNodeReadingSummary, sameNodeReviewSummary, type NodeLearningSummary } from '../../lib/core/nodes/nodeLearningSummary';
import type { Node } from '../features/nodes/model/nodeTypes';

import { isSameReadingProfile } from './workspaceActionHistoryReading';
import { isSameReviewProfile } from './workspaceReviewGradeActionHistory';

type LearningNode = Pick<Node, 'reading' | 'review'> & { learningSummary?: NodeLearningSummary };

export function isSameNodeReading(left: LearningNode | undefined, right: LearningNode | undefined) {
  return left?.reading !== undefined && right?.reading !== undefined
    ? isSameReadingProfile(left.reading, right.reading) : sameNodeReadingSummary(left, right);
}

export function isSameNodeReview(left: LearningNode | undefined, right: LearningNode | undefined) {
  return left?.review !== undefined && right?.review !== undefined
    ? isSameReviewProfile(left.review, right.review) : sameNodeReviewSummary(left, right);
}
