import { useCallback, useEffect, useMemo, useRef } from 'react';

import { subscribeNativeAppBackground } from '../shared/platform/appLifecycle';
import {
  saveCompanionSyncActiveViewState,
  saveCompanionSyncNodeViewState
} from '../shared/platform/companionSyncObjects';

import type { CompanionTabAction } from './CompanionFloatingBars';

function useCompanionScrollSave(currentViewNodeId: string | null) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ nodeId: string; scrollTop: number } | null>(null);
  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const position = pending.current;
    pending.current = null;
    if (position) void saveCompanionSyncNodeViewState(position).catch(() => undefined);
  }, []);

  useEffect(() => flush, [currentViewNodeId, flush]);
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void subscribeNativeAppBackground(flush).then((cleanup) => {
      if (disposed) cleanup();
      else unsubscribe = cleanup;
    }).catch(() => undefined);
    return () => { disposed = true; unsubscribe?.(); };
  }, [flush]);

  return useCallback((scrollTop: number) => {
    if (!currentViewNodeId) return;
    if (timer.current !== null) clearTimeout(timer.current);
    pending.current = { nodeId: currentViewNodeId, scrollTop };
    timer.current = setTimeout(flush, 800);
  }, [currentViewNodeId, flush]);
}

export function useCompanionViewStateSync(args: {
  activeAction: CompanionTabAction;
  readableArticleNodeId: string | null;
  reviewNodeId: string | null;
  selectedBrowseNodeId: string | null;
}) {
  const lastVisibleNodeIdRef = useRef<string | null>(null);
  const currentViewNodeId = useMemo(() => {
    if (args.activeAction === 'review') {
      return args.reviewNodeId;
    }
    return args.selectedBrowseNodeId ?? args.readableArticleNodeId;
  }, [args.activeAction, args.readableArticleNodeId, args.reviewNodeId, args.selectedBrowseNodeId]);

  useEffect(() => {
    if (currentViewNodeId === lastVisibleNodeIdRef.current) return;
    lastVisibleNodeIdRef.current = currentViewNodeId;
    void saveCompanionSyncActiveViewState(currentViewNodeId);
  }, [currentViewNodeId]);

  return useCompanionScrollSave(currentViewNodeId);
}
