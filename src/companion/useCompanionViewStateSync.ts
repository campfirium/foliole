import { useCallback, useEffect, useMemo, useRef } from 'react';

import { subscribeNativeAppBackground } from '../shared/platform/appLifecycle';
import {
  saveCompanionSyncActiveViewState,
  saveCompanionSyncNodeViewState
} from '../shared/platform/companionSyncObjects';

import type { CompanionTabAction } from './CompanionFloatingBars';

function useCompanionScrollSave(currentViewNodeId: string | null) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef<{ nodeId: string; scrollTop: number } | null>(null);
  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const position = pending.current;
    pending.current = null;
    if (position) {
      inFlight.current = saveCompanionSyncNodeViewState(position);
      void inFlight.current.catch(() => undefined);
    }
    return inFlight.current.then(() => undefined);
  }, []);

  useEffect(() => () => { void flush().catch(() => undefined); }, [currentViewNodeId, flush]);
  useEffect(() => {
    const onPageHide = () => { void flush().catch(() => undefined); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') onPageHide(); };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush]);
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void subscribeNativeAppBackground(() => { void flush().catch(() => undefined); }).then((cleanup) => {
      if (disposed) cleanup();
      else unsubscribe = cleanup;
    }).catch(() => undefined);
    return () => { disposed = true; unsubscribe?.(); };
  }, [flush]);

  const handleScroll = useCallback((scrollTop: number) => {
    if (!currentViewNodeId) return;
    if (timer.current !== null) clearTimeout(timer.current);
    pending.current = { nodeId: currentViewNodeId, scrollTop };
    timer.current = setTimeout(() => { void flush().catch(() => undefined); }, 800);
  }, [currentViewNodeId, flush]);
  return Object.assign(handleScroll, { flush });
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
