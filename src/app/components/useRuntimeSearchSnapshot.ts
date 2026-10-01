import { useCallback, useEffect, useRef, useState } from 'react';

import {
  loadWorkspaceSearchBatchInRuntime,
  releaseWorkspaceSearchInRuntime,
  searchWorkspaceInRuntime,
  subscribeSearchAliasesChanged
} from '../../shared/platform/appRuntimeCommandRepository';

import type { WorkspaceSearchResult } from './workspaceSearch';

interface RuntimeSearchState {
  aliasSpellings: Array<{ key: string; label: string }>;
  error: boolean;
  loading: boolean;
  query: string;
  hasMore: boolean;
  results: WorkspaceSearchResult[];
  selectedSpelling: string | null;
  snapshotId: string;
}

const EMPTY_STATE: RuntimeSearchState = {
  aliasSpellings: [], error: false, loading: false, query: '', hasMore: false, results: [], selectedSpelling: null, snapshotId: ''
};

export function useRuntimeSearchSnapshot(isOpen: boolean, hasRuntime: boolean, query: string) {
  const [state, setState] = useState<RuntimeSearchState>(EMPTY_STATE);
  const snapshotRef = useRef('');
  const selectedRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const revisionRef = useRef(0);
  const refreshTick = useSearchAliasRevision(isOpen, hasRuntime, revisionRef);

  useEffect(() => {
    let cancelled = false;
    let ownedId = '';
    snapshotRef.current = '';
    selectedRef.current = null;
    loadingRef.current = false;
    setState({ ...EMPTY_STATE, loading: Boolean(isOpen && hasRuntime && query.trim()), query });
    if (isOpen && hasRuntime && query.trim()) {
      void searchWorkspaceInRuntime(query).then((snapshot) => {
        ownedId = snapshot.snapshotId;
        if (cancelled) {
          void releaseWorkspaceSearchInRuntime(ownedId);
          return;
        }
        snapshotRef.current = ownedId;
        revisionRef.current = snapshot.revision;
        setState({ ...snapshot, error: false, loading: false, query, selectedSpelling: null });
      }).catch(() => { if (!cancelled) setState({ ...EMPTY_STATE, error: true, query }); });
    }
    return () => {
      cancelled = true;
      if (ownedId) void releaseWorkspaceSearchInRuntime(ownedId);
      if (snapshotRef.current === ownedId) snapshotRef.current = '';
    };
  }, [hasRuntime, isOpen, query, refreshTick]);

  const selectSpelling = useCallback((spelling: string | null) => {
    const id = snapshotRef.current;
    if (!id || selectedRef.current === spelling) return;
    selectedRef.current = spelling;
    loadingRef.current = false;
    setState((current) => ({ ...current, results: [], hasMore: false, loading: true, error: false, selectedSpelling: spelling }));
    void loadWorkspaceSearchBatchInRuntime(id, 0, spelling).then((batch) => {
      if (snapshotRef.current !== id || selectedRef.current !== spelling) return;
      setState((current) => ({ ...current, ...batch, loading: false }));
    }).catch(() => {
      if (snapshotRef.current === id && selectedRef.current === spelling) setState((current) => ({ ...current, error: true, loading: false }));
    });
  }, []);

  const loadMore = useCallback(() => {
    const id = snapshotRef.current;
    if (!id || !state.hasMore || loadingRef.current) return;
    const spelling = selectedRef.current;
    const offset = state.results.length;
    loadingRef.current = true;
    void loadWorkspaceSearchBatchInRuntime(id, offset, spelling).then((batch) => {
      if (snapshotRef.current !== id || selectedRef.current !== spelling) return;
      setState((current) => ({ ...current, hasMore: batch.hasMore, results: [...current.results, ...batch.results] }));
    }).catch(() => {
      if (snapshotRef.current === id) setState((current) => ({ ...current, error: true }));
    }).finally(() => { loadingRef.current = false; });
  }, [state.hasMore, state.results.length]);

  return { ...state, loading: isOpen && hasRuntime && Boolean(query.trim()) && (state.query !== query || state.loading), loadMore, selectSpelling };
}

function useSearchAliasRevision(
  isOpen: boolean,
  hasRuntime: boolean,
  revisionRef: { current: number }
) {
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    if (!isOpen || !hasRuntime) return;
    return subscribeSearchAliasesChanged((revision) => {
      if (revision === revisionRef.current) return;
      revisionRef.current = revision;
      setRefreshTick((current) => current + 1);
    });
  }, [hasRuntime, isOpen, revisionRef]);
  return refreshTick;
}
