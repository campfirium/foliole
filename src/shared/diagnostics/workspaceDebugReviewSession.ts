import { useWorkspaceStore } from '../../store/workspaceStore';

export function completeDebugReviewSession(args: {
  completedAt: string;
  continueNodeId: string;
  sessionStartedAt: string;
}) {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: args.continueNodeId,
    reviewSession: {
      completedAt: args.completedAt,
      continueNodeId: args.continueNodeId,
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      readTopicCount: 0,
      readingElapsedMs: 0,
      reviewElapsedMs: Date.parse(args.completedAt) - Date.parse(args.sessionStartedAt),
      reviewedItemCount: 1,
      sessionStartedAt: args.sessionStartedAt,
      totalNodeCount: 1
    },
    reviewSessionMode: state.reviewSessionMode
  }));
}
