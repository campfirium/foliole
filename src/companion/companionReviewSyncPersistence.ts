import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { SchedulerCard, ReviewGrade } from '../features/review/model/reviewTypes';
import { definedProps } from '../shared/lib/definedProps';
import {
  saveCompanionSyncNodeReadingRecord,
  saveCompanionSyncNodeReviewRecord
} from '../shared/platform/companionSyncObjects';

export interface CompanionReviewLogInput {
  cardAfter: SchedulerCard;
  cardBefore: SchedulerCard;
  grade: ReviewGrade;
  reviewedAt: string;
  schedulerVersion: string;
}

export async function persistCompanionReviewSyncObject(args: {
  itemKind: 'fsrs' | 'reading';
  nodeId: string;
  reviewLog?: CompanionReviewLogInput;
  snapshot: WorkspaceSnapshot;
}) {
  const node = args.snapshot.nodesById[args.nodeId];
  if (!node) {
    return null;
  }
  if (args.itemKind === 'reading' && node.reading) {
    return saveCompanionSyncNodeReadingRecord({ nodeId: args.nodeId, reading: node.reading });
  }
  if (args.itemKind === 'fsrs' && node.review) {
    return saveCompanionSyncNodeReviewRecord({
      nodeId: args.nodeId,
      review: node.review,
      ...definedProps({ reviewLog: args.reviewLog })
    });
  }
  return null;
}
