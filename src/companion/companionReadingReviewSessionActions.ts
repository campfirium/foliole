import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import {
  dismissCompanionReviewTopic as dismissCompanionReviewTopicBase,
  postponeCompanionReviewTopic as postponeCompanionReviewTopicBase,
  readCompanionReviewTopic as readCompanionReviewTopicBase
} from './companionReadingReview';
import { resolveCompanionReviewSession } from './companionReviewSession';

function toCompanionReviewResult(snapshot: WorkspaceSnapshot, now: string, syncNodeIds: string[]) {
  return {
    nextSession: resolveCompanionReviewSession(snapshot, now),
    snapshot,
    syncNodeIds
  };
}

function applyCompanionReadingReviewTopic(
  action: (args: {
    nodeId: string;
    now: string;
    releaseSequentialReading?: boolean;
    snapshot: WorkspaceSnapshot;
  }) => { snapshot: WorkspaceSnapshot; syncNodeIds: string[] } | null,
  args: { nodeId: string; now?: string; releaseSequentialReading?: boolean; snapshot: WorkspaceSnapshot }
) {
  const now = args.now ?? new Date().toISOString();
  const result = action({ ...args, now });
  return result ? toCompanionReviewResult(result.snapshot, now, result.syncNodeIds) : null;
}

export function readCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  releaseSequentialReading?: boolean;
  snapshot: WorkspaceSnapshot;
}) {
  return applyCompanionReadingReviewTopic(readCompanionReviewTopicBase, args);
}

export function postponeCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return applyCompanionReadingReviewTopic(postponeCompanionReviewTopicBase, args);
}

export function dismissCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return applyCompanionReadingReviewTopic(dismissCompanionReviewTopicBase, args);
}
