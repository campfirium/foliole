import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { DailyFlowLearningReceipt } from '../../lib/core/flow/dailyFlowContract';
import type { Node } from '../features/nodes/model/nodeTypes';
import { recordWorkspaceRecordPatch } from '../shared/workspaceRecordPatch';

import { isSameNodeReading, isSameNodeReview } from './workspaceNodeLearningComparison';




type ReceiptNode = Node | WorkspaceNodeSnapshot;

export function mergeDailyFlowReceiptNodes<T extends ReceiptNode>(current: Record<string, T>, before: Record<string, T>,
  receipt: Record<string, WorkspaceNodeSnapshot> | undefined, learning?: Record<string, DailyFlowLearningReceipt>) {
  if (!Object.keys(receipt ?? {}).length && !Object.keys(learning ?? {}).length) return current;
  let nodes = current;
  const changedIds: string[] = [];
  for (const [id, value] of Object.entries(receipt ?? {})) {
    if (!current[id]) {
      if (nodes === current) nodes = { ...current };
      nodes[id] = value as T;
      changedIds.push(id);
    }
  }
  for (const [id, value] of Object.entries(learning ?? {})) {
    const node = current[id];
    if (!node) continue;
    const expected = before[id];
    if (!expected) continue;
    const reviewChanged = isSameNodeReview(node, expected) && !isSameNodeReview(node, value);
    const readingChanged = isSameNodeReading(node, expected) && !isSameNodeReading(node, value);
    if (!reviewChanged && !readingChanged) continue;
    if (nodes === current) nodes = { ...current };
    nodes[id] = { ...node,
      ...(reviewChanged ? { review: value.review } : {}),
      ...(readingChanged ? { reading: value.reading } : {}) };
    changedIds.push(id);
  }
  return nodes === current ? nodes : recordWorkspaceRecordPatch(current, nodes, changedIds);
}
