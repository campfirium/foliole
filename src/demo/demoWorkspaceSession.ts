import type { ReviewSessionState } from '../store/workspaceStore';

export function createDemoReviewSession(activeNodeId: string, timestamp: string): ReviewSessionState {
  return {
    currentNodeId: activeNodeId,
    currentItemStartedAt: timestamp,
    isAnswerRevealed: false,
    queueNodeIds: [activeNodeId],
    sessionStartedAt: timestamp,
    totalNodeCount: 1
  };
}
