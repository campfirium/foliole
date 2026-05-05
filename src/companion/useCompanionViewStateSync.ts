import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  saveCompanionSyncActiveViewState,
  saveCompanionSyncNodeViewState
} from '../shared/platform/companionSyncObjects';

import type { CompanionTabAction } from './CompanionFloatingBars';

type ScrollSaveTimer = ReturnType<typeof setTimeout>;

export function useCompanionViewStateSync(args: {
  activeAction: CompanionTabAction;
  readableArticleNodeId: string | null;
  reviewNodeId: string | null;
  selectedBrowseNodeId: string | null;
}) {
  const scrollSaveTimerRef = useRef<ScrollSaveTimer | null>(null);
  const currentViewNodeId = useMemo(() => {
    if (args.activeAction === 'review') {
      return args.reviewNodeId;
    }
    return args.selectedBrowseNodeId ?? args.readableArticleNodeId;
  }, [args.activeAction, args.readableArticleNodeId, args.reviewNodeId, args.selectedBrowseNodeId]);

  useEffect(() => {
    void saveCompanionSyncActiveViewState(currentViewNodeId);
  }, [currentViewNodeId]);

  useEffect(() => {
    return () => {
      if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current);
    };
  }, []);

  return useCallback((scrollTop: number) => {
    if (!currentViewNodeId) return;
    if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current);
    scrollSaveTimerRef.current = setTimeout(() => {
      void saveCompanionSyncNodeViewState({
        nodeId: currentViewNodeId,
        scrollTop
      });
    }, 800);
  }, [currentViewNodeId]);
}
