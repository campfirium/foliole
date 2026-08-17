import type { Node } from '../features/nodes/model/nodeTypes';

import { cloneRelatedReadings } from './workspaceActionHistoryReading';
import type { WorkspaceHistoryContext } from './workspaceHistoryContext';
import { cloneWorkspaceReviewSession } from './workspaceHistoryContext';

const SHELVE_TOPIC_ACTION_TITLE = 'Shelve Topic';
const UNSHELVE_TOPIC_ACTION_TITLE = 'Unshelve Topic';

export interface WorkspaceTopicShelveHistoryEntry {
  afterContext: WorkspaceHistoryContext;
  afterShelvedAt: string | null;
  beforeContext: WorkspaceHistoryContext;
  beforeShelvedAt: string | null;
  id: string;
  mutationTimestamp: string;
  nodeId: string;
  relatedReadings?: Array<{
    afterReading: Node['reading'];
    beforeReading: Node['reading'];
    nodeId: string;
  }>;
  title: typeof SHELVE_TOPIC_ACTION_TITLE | typeof UNSHELVE_TOPIC_ACTION_TITLE;
  type: 'topic.shelve';
}

export function createTopicShelveHistoryEntry(args: {
  afterContext: WorkspaceHistoryContext;
  afterShelvedAt: string | null;
  beforeContext: WorkspaceHistoryContext;
  beforeShelvedAt: string | null;
  id: string;
  mutationTimestamp: string;
  nodeId: string;
  relatedReadings?: Array<{
    afterReading: Node['reading'];
    beforeReading: Node['reading'];
    nodeId: string;
  }>;
}): WorkspaceTopicShelveHistoryEntry {
  const entry: WorkspaceTopicShelveHistoryEntry = {
    afterContext: { ...args.afterContext, reviewSession: cloneWorkspaceReviewSession(args.afterContext.reviewSession) },
    afterShelvedAt: args.afterShelvedAt,
    beforeContext: { ...args.beforeContext, reviewSession: cloneWorkspaceReviewSession(args.beforeContext.reviewSession) },
    beforeShelvedAt: args.beforeShelvedAt,
    id: args.id,
    mutationTimestamp: args.mutationTimestamp,
    nodeId: args.nodeId,
    title: args.afterShelvedAt ? SHELVE_TOPIC_ACTION_TITLE : UNSHELVE_TOPIC_ACTION_TITLE,
    type: 'topic.shelve'
  };
  if (args.relatedReadings?.length) entry.relatedReadings = cloneRelatedReadings(args.relatedReadings) ?? [];
  return entry;
}
