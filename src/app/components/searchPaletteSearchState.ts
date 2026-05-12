import { useEffect, useMemo, useState } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
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

export function useSearchResults(props: SearchSourceProps, query: string) {
  const localResults = useMemo(
    () => buildWorkspaceSearchResults(props.nodeOrder, props.nodesById, props.trashedNodeIds, query),
    [props.nodeOrder, props.nodesById, props.trashedNodeIds, query]
  );
  const hasRuntime = hasWorkspaceSearchRuntimeRepository();
  const { runtimeError, runtimeResults } = useRuntimeSearchResults(props.isOpen, hasRuntime, query);
  const removedResults = useRemovedSearchResults(props.isOpen, query);
  const results = useMemo(
    () => (hasRuntime ? [...runtimeResults, ...removedResults] : [...localResults, ...removedResults]),
    [hasRuntime, localResults, removedResults, runtimeResults]
  );
  return { error: hasRuntime ? runtimeError : false, results };
}

export function useOrderedSearchResults(
  results: WorkspaceSearchResult[],
  nodesById: WorkspaceListNodesById
) {
  return useMemo(() => {
    const externalResults: WorkspaceSearchResult[] = [];
    const removedResults: WorkspaceSearchResult[] = [];
    const regularResults: WorkspaceSearchResult[] = [];
    const anchoredResults: WorkspaceSearchResult[] = [];
    results.forEach((result) => {
      if (result.kind === 'external') externalResults.push(result);
      else if (result.kind === 'removed') removedResults.push(result);
      else if (nodesById[result.id]?.anchorLink?.kind) anchoredResults.push(result);
      else regularResults.push(result);
    });
    return [...regularResults, ...anchoredResults, ...removedResults, ...externalResults];
  }, [nodesById, results]);
}
