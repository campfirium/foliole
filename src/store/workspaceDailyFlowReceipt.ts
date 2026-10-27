import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { Node } from '../features/nodes/model/nodeTypes';

import { isSameReadingProfile } from './workspaceActionHistoryReading';
import { isSameReviewProfile } from './workspaceReviewGradeActionHistory';

type ReceiptNode = Node | WorkspaceNodeSnapshot;

export function mergeDailyFlowReceiptNodes<T extends ReceiptNode>(current: Record<string, T>, before: Record<string, T>,
  receipt: Record<string, WorkspaceNodeSnapshot> | undefined) {
  if (!receipt || !Object.keys(receipt).length) return current;
  const nodes = { ...current };
  for (const [id, value] of Object.entries(receipt ?? {})) {
    const node = current[id];
    if (!node) { nodes[id] = value as T; continue; }
    const expected = before[id];
    if (!expected) continue;
    nodes[id] = { ...node,
      ...(isSameReviewProfile(node.review, expected.review) ? { review: value.review } : {}),
      ...(isSameReadingProfile(node.reading, expected.reading) ? { reading: value.reading } : {}) };
  }
  return nodes;
}
