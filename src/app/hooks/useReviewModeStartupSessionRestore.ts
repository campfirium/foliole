import { useEffect, useRef } from 'react';

export function useReviewModeStartupSessionRestore(args: {
  activeNodeId: string | null;
  isReviewSessionCompleted: boolean;
  isStudyMode: boolean;
  isWorkspaceHydrated: boolean;
  onReviewSessionStarted: () => void;
  resumeReviewSession: () => boolean;
  reviewCurrentNodeId: string | null;
  startReviewSession: () => boolean;
}) {
  const restoredEntryRef = useRef(false);

  useEffect(() => {
    if (!args.isStudyMode || !args.isWorkspaceHydrated) {
      restoredEntryRef.current = false;
      return;
    }
    if (!restoredEntryRef.current) {
      restoredEntryRef.current = true;
      args.onReviewSessionStarted();
    }
    const isCurrentReviewItemActive = Boolean(
      args.reviewCurrentNodeId &&
        args.activeNodeId === args.reviewCurrentNodeId
    );
    if (isCurrentReviewItemActive) {
      return;
    }
    if (args.resumeReviewSession()) {
      return;
    }
    if (!args.reviewCurrentNodeId && !args.isReviewSessionCompleted) {
      args.startReviewSession();
    }
  }, [
    args.activeNodeId,
    args.isReviewSessionCompleted,
    args.isStudyMode,
    args.isWorkspaceHydrated,
    args.onReviewSessionStarted,
    args.resumeReviewSession,
    args.reviewCurrentNodeId,
    args.startReviewSession
  ]);
}
