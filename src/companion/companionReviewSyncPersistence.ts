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
  nodeIds?: string[];
  reviewLog?: CompanionReviewLogInput;
  snapshot: WorkspaceSnapshot;
}) {
  const nodeIds = args.nodeIds ?? [args.nodeId];
  const node = args.snapshot.nodesById[args.nodeId];
  if (!node) {
    return null;
  }
  if (args.itemKind === 'reading' && node.reading) {
    const persisted = [];
    for (const nodeId of nodeIds) {
      const readingNode = args.snapshot.nodesById[nodeId];
      if (!readingNode?.reading) return null;
      const result = await saveCompanionSyncNodeReadingRecord({ nodeId, reading: readingNode.reading });
      if (!result) return null;
      persisted.push(result);
    }
    return persisted;
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
