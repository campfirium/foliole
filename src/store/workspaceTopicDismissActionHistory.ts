import type { NodeReadingProfile } from '../features/nodes/model/nodeTypes';

import {
  cloneReadingProfile,
  cloneRelatedReadings
} from './workspaceActionHistoryReading';
import type { WorkspaceHistoryContext } from './workspaceHistoryContext';
import { cloneWorkspaceReviewSession } from './workspaceHistoryContext';

const DISMISS_TOPIC_ACTION_TITLE = 'Dismiss Topic';
export type WorkspaceTopicReadingActionTitle =
  'Read Topic' | 'Later Topic' | 'Soon Topic' | 'Postpone Topic' | typeof DISMISS_TOPIC_ACTION_TITLE;

export interface WorkspaceTopicDismissHistoryEntry {
  afterContext: WorkspaceHistoryContext;
  afterReading: NodeReadingProfile | null;
  beforeContext: WorkspaceHistoryContext;
  beforeReading: NodeReadingProfile | null;
  id: string;
  mutationTimestamp: string;
  nodeId: string;
  relatedReadings?: Array<{
    afterReading: NodeReadingProfile | null;
    beforeReading: NodeReadingProfile | null;
    nodeId: string;
  }>;
  title: WorkspaceTopicReadingActionTitle;
  type: 'topic.dismiss';
}

export function createTopicDismissHistoryEntry(args: {
  afterContext: WorkspaceHistoryContext;
  afterReading: NodeReadingProfile | null | undefined;
  beforeContext: WorkspaceHistoryContext;
  beforeReading: NodeReadingProfile | null | undefined;
  id: string;
  mutationTimestamp: string;
  nodeId: string;
  relatedReadings?: Array<{
    afterReading: NodeReadingProfile | null | undefined;
    beforeReading: NodeReadingProfile | null | undefined;
    nodeId: string;
  }>;
  title?: WorkspaceTopicReadingActionTitle;
}): WorkspaceTopicDismissHistoryEntry {
  const entry: WorkspaceTopicDismissHistoryEntry = {
    afterContext: { ...args.afterContext, reviewSession: cloneWorkspaceReviewSession(args.afterContext.reviewSession) },
    afterReading: cloneReadingProfile(args.afterReading),
    beforeContext: { ...args.beforeContext, reviewSession: cloneWorkspaceReviewSession(args.beforeContext.reviewSession) },
    beforeReading: cloneReadingProfile(args.beforeReading),
    id: args.id,
    mutationTimestamp: args.mutationTimestamp,
    nodeId: args.nodeId,
    title: args.title ?? DISMISS_TOPIC_ACTION_TITLE,
    type: 'topic.dismiss'
  };
  if (args.relatedReadings?.length) entry.relatedReadings = cloneRelatedReadings(args.relatedReadings) ?? [];
  return entry;
}

export function resolveTopicReadingHistoryApply(entry: WorkspaceTopicDismissHistoryEntry, mode: 'redo' | 'undo') {
  const expectedReading = mode === 'undo' ? entry.afterReading : entry.beforeReading;
  const nextReading = mode === 'undo' ? entry.beforeReading : entry.afterReading;
  const relatedReadings = (entry.relatedReadings ?? []).map((reading) => ({
    expectedReading: mode === 'undo' ? reading.afterReading : reading.beforeReading,
    nextReading: mode === 'undo' ? reading.beforeReading : reading.afterReading,
    nodeId: reading.nodeId
  }));
  return { expectedReading, nextReading, relatedReadings };
}
