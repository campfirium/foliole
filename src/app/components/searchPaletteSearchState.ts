import { useEffect, useMemo, useState } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useLocalization } from '../../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../../shared/localization/systemEntryNames';
import {
  hasWorkspaceSearchRuntimeRepository,
  searchWorkspaceInRuntime
} from '../../shared/platform/appRuntimeCommandRepository';
import { loadRuntimeRemovedSources } from '../../shared/platform/removedSourcesRuntimeRepository';

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

function useRuntimeSearchResults(isOpen: boolean, hasRuntime: boolean, query: string) {
  const [runtimeResults, setRuntimeResults] = useState<WorkspaceSearchResult[]>([]);
  const [runtimeError, setRuntimeError] = useState(false);
  useEffect(() => {
    if (!isOpen || !hasRuntime || !query.trim()) {
      setRuntimeResults([]);
      setRuntimeError(false);
      return;
    }

    let cancelled = false;
    setRuntimeResults([]);
    setRuntimeError(false);
    void searchWorkspaceInRuntime(query)
      .then((results) => {
        if (!cancelled) setRuntimeResults(results);
      })
      .catch(() => {
        if (!cancelled) setRuntimeError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hasRuntime, isOpen, query]);
  return { runtimeError, runtimeResults };
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
  const { runtimeError, runtimeResults } = useRuntimeSearchResults(props.isOpen, hasRuntime, executionQuery);
  const removedResults = useRemovedSearchResults(props.isOpen, executionQuery);
  const results = useMemo(
    () =>
      hasPendingQuery
        ? []
        : (hasRuntime ? [...runtimeResults, ...removedResults] : [...localResults, ...removedResults]).map((result) =>
          result.kind === 'node' ? { ...result, title: resolveNodeDisplayTitle(locale, result.id, result.title) } : result
        ),
    [hasPendingQuery, hasRuntime, localResults, locale, removedResults, runtimeResults]
  );
  return { error: hasRuntime ? runtimeError : false, results };
}

export function useOrderedSearchResults(
  results: WorkspaceSearchResult[],
  nodesById: WorkspaceListNodesById
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
    return [...regularResults, ...anchoredResults, ...removedResults, ...openedResults, ...externalResults];
  }, [nodesById, results]);
}
