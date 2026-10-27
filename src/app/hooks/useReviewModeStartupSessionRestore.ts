import { useEffect, useRef } from 'react';

export function useReviewModeRestoredSessionAutoOpen(args: {
  isReviewSessionCompleted: boolean;
  isReviewSchedulerSettingsReady: boolean;
  isStudyMode: boolean;
  isWorkspaceHydrated: boolean;
  reviewCurrentNodeId: string | null;
  isReviewSessionStarted?: boolean;
  startStudyMode: (options?: { force?: boolean }) => void;
}) {
  const openedRestoredSessionRef = useRef(false);

  useEffect(() => {
    if (!args.isWorkspaceHydrated || !args.isReviewSchedulerSettingsReady || args.isStudyMode) {
      return;
    }
    if (openedRestoredSessionRef.current) {
      return;
    }
    if (!args.reviewCurrentNodeId || args.isReviewSessionStarted === false) {
      return;
    }
    openedRestoredSessionRef.current = true;
    args.startStudyMode({ force: true });
  }, [
    args.isReviewSessionCompleted,
    args.isReviewSchedulerSettingsReady,
    args.isStudyMode,
    args.isWorkspaceHydrated,
    args.reviewCurrentNodeId,
    args.isReviewSessionStarted,
    args.startStudyMode
  ]);
}

export function useReviewModeStartupSessionRestore(args: {
  activeNodeId: string | null;
  isReviewSessionCompleted: boolean;
  isReviewSchedulerSettingsReady: boolean;
  isStudyMode: boolean;
  isWorkspaceHydrated: boolean;
  onReviewSessionStarted: () => void;
  resumeReviewSession: () => string | false | Promise<string | false>;
  reviewCurrentNodeId: string | null;
  startReviewSession: () => boolean | Promise<boolean>;
}) {
  const restoredEntryRef = useRef(false);

  useEffect(() => {
    if (!args.isStudyMode || !args.isWorkspaceHydrated || !args.isReviewSchedulerSettingsReady) {
      restoredEntryRef.current = false;
      return;
    }
    if (restoredEntryRef.current) {
      return;
    }
    restoredEntryRef.current = true;
    args.onReviewSessionStarted();
    const isCurrentReviewItemActive = Boolean(
      args.reviewCurrentNodeId &&
        args.activeNodeId === args.reviewCurrentNodeId
    );
    if (isCurrentReviewItemActive) {
      return;
    }
    void Promise.resolve(args.resumeReviewSession()).then(resumed => {
      if (!resumed && !args.reviewCurrentNodeId && !args.isReviewSessionCompleted) return args.startReviewSession();
      return undefined;
    });
  }, [
    args.activeNodeId,
    args.isReviewSessionCompleted,
    args.isReviewSchedulerSettingsReady,
    args.isStudyMode,
    args.isWorkspaceHydrated,
    args.onReviewSessionStarted,
    args.resumeReviewSession,
    args.reviewCurrentNodeId,
    args.startReviewSession
  ]);
}
