import { useEffect, useMemo, useState } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useLocalization } from '../../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../../shared/localization/systemEntryNames';
import {
  hasWorkspaceSearchRuntimeRepository
} from '../../shared/platform/appRuntimeCommandRepository';
import { loadRuntimeRemovedSources } from '../../shared/platform/removedSourcesRuntimeRepository';

import { useRuntimeSearchSnapshot } from './useRuntimeSearchSnapshot';
import {
  buildRemovedWorkspaceSearchResults,
  buildWorkspaceSearchResults,
  type WorkspaceSearchResult
} from './workspaceSearch';

interface SearchSourceProps {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  trashedNodeIds: string[];
}

const SEARCH_QUERY_DEBOUNCE_MS = 400;

function useSearchExecutionQuery(isOpen: boolean, query: string, isComposing: boolean) {
  const [executionQuery, setExecutionQuery] = useState('');
  const trimmedQuery = query.trim();
  useEffect(() => {
    if (!isOpen || !trimmedQuery) {
      setExecutionQuery('');
      return;
    }
    if (isComposing) return;

    const timer = window.setTimeout(() => {
      setExecutionQuery(query);
    }, SEARCH_QUERY_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isComposing, isOpen, query, trimmedQuery]);
  return executionQuery;
}

function useRemovedSearchResults(isOpen: boolean, query: string) {
  const [removedResults, setRemovedResults] = useState<WorkspaceSearchResult[]>([]);
  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setRemovedResults([]);
      return;
    }

    let cancelled = false;
    setRemovedResults([]);
    void loadRuntimeRemovedSources()
      .then((result) => {
        if (!cancelled) setRemovedResults(buildRemovedWorkspaceSearchResults(result.entries, query));
      })
      .catch(() => {
        if (!cancelled) setRemovedResults([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, query]);
  return removedResults;
}

function applySelectedAliasMatch(result: WorkspaceSearchResult, spelling: string | null) {
  const match = spelling ? result.aliasMatches?.find((item) => item.spelling === spelling) : null;
  return match ? { ...result, ...match } : result;
}

export function useSearchResults(props: SearchSourceProps, query: string, isComposing = false) {
  const { locale } = useLocalization();
  const hasRuntime = hasWorkspaceSearchRuntimeRepository();
  const executionQuery = useSearchExecutionQuery(props.isOpen, query, isComposing);
  const hasPendingQuery = query.trim() !== executionQuery.trim();
  const localResults = useMemo(
    () =>
      hasRuntime
        ? []
        : buildWorkspaceSearchResults(props.nodeOrder, props.nodesById, props.trashedNodeIds, executionQuery),
    [executionQuery, hasRuntime, props.nodeOrder, props.nodesById, props.trashedNodeIds]
  );
  const runtime = useRuntimeSearchSnapshot(props.isOpen, hasRuntime, executionQuery);
  const removedResults = useRemovedSearchResults(props.isOpen, executionQuery);
  const results = useMemo(
    () =>
      hasPendingQuery
        ? []
        : (hasRuntime ? [...runtime.results, ...(runtime.selectedSpelling ? [] : removedResults)] : [...localResults, ...removedResults]).map((result) => {
          const selected = applySelectedAliasMatch(result, runtime.selectedSpelling);
          return selected.kind === 'node' ? { ...selected, title: resolveNodeDisplayTitle(locale, selected.id, selected.title) } : selected;
        }),
    [hasPendingQuery, hasRuntime, localResults, locale, removedResults, runtime.results, runtime.selectedSpelling]
  );
  return {
    aliasSpellings: hasPendingQuery ? [] : runtime.aliasSpellings,
    error: hasRuntime ? runtime.error : false,
    hasMore: hasPendingQuery ? false : runtime.hasMore,
    loadMore: runtime.loadMore,
    results,
    selectedSpelling: runtime.selectedSpelling,
    selectSpelling: runtime.selectSpelling
  };
}

export function useOrderedSearchResults(
  results: WorkspaceSearchResult[],
  nodesById: WorkspaceListNodesById,
  prioritizeOriginal = false
) {
  return useMemo(() => {
    const externalResults: WorkspaceSearchResult[] = [];
    const openedResults: WorkspaceSearchResult[] = [];
    const removedResults: WorkspaceSearchResult[] = [];
    const regularResults: WorkspaceSearchResult[] = [];
    const anchoredResults: WorkspaceSearchResult[] = [];
    results.forEach((result) => {
      if (result.kind === 'external' && result.externalMatch?.sourceKind === 'opened') openedResults.push(result);
      else if (result.kind === 'external') externalResults.push(result);
      else if (result.kind === 'removed') removedResults.push(result);
      else if (nodesById[result.id]?.anchorLink?.kind) anchoredResults.push(result);
      else regularResults.push(result);
    });
    const ordered = [...regularResults, ...anchoredResults, ...removedResults, ...openedResults, ...externalResults];
    return prioritizeOriginal
      ? ordered.sort((left, right) => Number(Boolean(right.matchedOriginal)) - Number(Boolean(left.matchedOriginal)))
      : ordered;
  }, [nodesById, prioritizeOriginal, results]);
}
