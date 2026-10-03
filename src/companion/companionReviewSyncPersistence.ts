import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { reviewCalendarDayKey } from '../../lib/core/review/reviewCalendarDates';
import type { SchedulerCard, ReviewGrade } from '../features/review/model/reviewTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { definedProps } from '../shared/lib/definedProps';
import {
  saveCompanionSyncNodeReadingRecord,
  saveCompanionSyncNodeReviewRecord
} from '../shared/platform/companionSyncObjects';
import { WorkspacePartialPersistenceError } from '../store/workspacePersistenceFailure';

export interface CompanionReviewLogInput {
  cardAfter: SchedulerCard;
  cardBefore: SchedulerCard;
  grade: ReviewGrade;
  reviewedAt: string;
  schedulerVersion: string;
}

export async function persistCompanionReviewSyncObject(args: {
  itemKind: 'fsrs' | 'reading';
  completedReading?: boolean;
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
      try {
        const readingNode = args.snapshot.nodesById[nodeId];
        if (!readingNode?.reading) {
          if (persisted.length > 0) throw new WorkspacePartialPersistenceError();
          return null;
        }
        const result = await saveCompanionSyncNodeReadingRecord({
          nodeId, reading: readingNode.reading,
          ...(args.completedReading && nodeId === args.nodeId ? {
            completedReviewDay: reviewCalendarDayKey(new Date(readingNode.reading.lastHandledAt),
              getCurrentReviewSchedulerSettings().newDayStartsAtHour)
          } : {})
        });
        if (!result) {
          if (persisted.length > 0) throw new WorkspacePartialPersistenceError();
          return null;
        }
        persisted.push(result);
      } catch (error) {
        if (persisted.length > 0) throw new WorkspacePartialPersistenceError();
        throw error;
      }
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
