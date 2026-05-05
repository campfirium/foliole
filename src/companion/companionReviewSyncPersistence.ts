import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import {
  saveCompanionSyncNodeReadingRecord,
  saveCompanionSyncNodeReviewRecord
} from '../shared/platform/companionSyncObjects';

export async function persistCompanionReviewSyncObject(args: {
  itemKind: 'fsrs' | 'reading';
  nodeId: string;
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
    return saveCompanionSyncNodeReviewRecord({ nodeId: args.nodeId, review: node.review });
  }
  return null;
}
