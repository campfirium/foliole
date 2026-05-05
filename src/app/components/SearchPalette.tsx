import { useEffect, useMemo, useRef, useState } from 'react';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import {
  loadRuntimeNodeSourceDetails,
  type RuntimeNodeSourceDetails
} from '../../shared/platform/nodeSourceBridge';
import { appFloatingOverlayClassName, appFloatingSurfaceClassName } from '../../shared/ui';

import { FloatingPaletteInput } from './FloatingPaletteInput';
import { useExternalSectionStatus } from './searchPaletteExternalStatus';
import { SearchPaletteEmptyState, SearchPaletteList } from './SearchPaletteResults';
import { buildWorkspaceSearchResults, type WorkspaceSearchResult } from './workspaceSearch';

interface SearchPaletteProps {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  trashedNodeIds: string[];
  onClose: () => void;
  onOpenResult: (result: WorkspaceSearchResult) => void;
}

function useSearchResults(
  props: Pick<SearchPaletteProps, 'isOpen' | 'nodeOrder' | 'nodesById' | 'trashedNodeIds'>,
  query: string
) {
  const localResults = useMemo(
    () =>
      buildWorkspaceSearchResults(props.nodeOrder, props.nodesById, props.trashedNodeIds, query),
    [props.nodeOrder, props.nodesById, props.trashedNodeIds, query]
  );
  const [runtimeResults, setRuntimeResults] = useState<WorkspaceSearchResult[]>([]);

  useEffect(() => {
    const runtimeInvoke = getRuntimeInvoke();
    if (!props.isOpen || !runtimeInvoke || !query.trim()) {
      setRuntimeResults([]);
      return;
    }

    let cancelled = false;
    setRuntimeResults([]);
    void runtimeInvoke(NATIVE_COMMANDS.searchWorkspace, { query }).then((results) => {
      if (!cancelled) {
        setRuntimeResults(results);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [props.isOpen, query]);

  return getRuntimeInvoke() ? runtimeResults : localResults;
}

function useSearchResultSourceDetails(results: WorkspaceSearchResult[]) {
  const [sourceDetailsByNodeId, setSourceDetailsByNodeId] = useState<
    Record<string, RuntimeNodeSourceDetails | null | undefined>
  >({});
  const cacheRef = useRef<Record<string, RuntimeNodeSourceDetails | null>>({});

  useEffect(() => {
    const nodeIds = [
      ...new Set(
        results
          .filter((result) => result.kind !== 'external')
          .map((result) => result.id)
          .filter(Boolean)
      )
    ];
    if (nodeIds.length === 0) {
      setSourceDetailsByNodeId({});
      return;
    }

    setSourceDetailsByNodeId((current) => {
      const nextEntries = Object.fromEntries(
        nodeIds.map((nodeId) => [nodeId, cacheRef.current[nodeId]])
      );
      const currentKeys = Object.keys(current);
      if (
        currentKeys.length === nodeIds.length &&
        nodeIds.every((nodeId) => current[nodeId] === nextEntries[nodeId])
      ) {
        return current;
      }
      return nextEntries;
    });

    const missingNodeIds = nodeIds.filter(
      (nodeId) => !Object.prototype.hasOwnProperty.call(cacheRef.current, nodeId)
    );
    if (missingNodeIds.length === 0) {
      return;
    }

    let cancelled = false;
    missingNodeIds.forEach((nodeId) => {
      void loadRuntimeNodeSourceDetails(nodeId).then((details) => {
        if (cancelled) {
          return;
        }
        cacheRef.current[nodeId] = details;
        setSourceDetailsByNodeId((current) =>
          current[nodeId] === details ? current : { ...current, [nodeId]: details }
        );
      });
    });

    return () => {
      cancelled = true;
    };
  }, [results]);

  return sourceDetailsByNodeId;
}

function useOrderedSearchResults(
  results: WorkspaceSearchResult[],
  nodesById: WorkspaceListNodesById
) {
  return useMemo(() => {
    const externalResults: WorkspaceSearchResult[] = [];
    const regularResults: WorkspaceSearchResult[] = [];
    const anchoredResults: WorkspaceSearchResult[] = [];
    results.forEach((result) => {
      if (result.kind === 'external') {
        externalResults.push(result);
        return;
      }
      if (nodesById[result.id]?.anchorLink?.kind) {
        anchoredResults.push(result);
        return;
      }
      regularResults.push(result);
    });
    return [...regularResults, ...anchoredResults, ...externalResults];
  }, [nodesById, results]);
}

export function SearchPalette(props: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rawResults = useSearchResults(props, query);
  const results = useOrderedSearchResults(rawResults, props.nodesById);
  const externalSectionStatus = useExternalSectionStatus(props.isOpen);
  const sourceDetailsByNodeId = useSearchResultSourceDetails(results);
  useSearchPaletteLifecycle(props.isOpen, activeIndex, results.length, setActiveIndex, setQuery);

  if (!props.isOpen) {
    return null;
  }

  const openActiveNode = () => {
    const result = results[activeIndex];
    if (result) {
      props.onOpenResult(result);
    }
  };

  return (
    <div
      aria-label="Workspace search"
      className={appFloatingOverlayClassName()}
      onClick={props.onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')}
        onClick={(event) => event.stopPropagation()}
      >
        <FloatingPaletteInput
          inputLabel="Search workspace"
          onClose={props.onClose}
          onQueryChange={setQuery}
          onRunActive={openActiveNode}
          onSetActiveIndex={setActiveIndex}
          placeholder="Search titles and content..."
          query={query}
          totalItems={results.length}
        />
        {results.length ? (
          <SearchPaletteList
            activeIndex={activeIndex}
            nodesById={props.nodesById}
            onOpenResult={props.onOpenResult}
            query={query}
            externalSectionStatus={externalSectionStatus}
            results={results}
            sourceDetailsByNodeId={sourceDetailsByNodeId}
          />
        ) : (
          <SearchPaletteEmptyState query={query} />
        )}
      </div>
    </div>
  );
}

function useSearchPaletteLifecycle(
  isOpen: boolean,
  activeIndex: number,
  resultCount: number,
  setActiveIndex: (value: number) => void,
  setQuery: (value: string) => void
) {
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen, setActiveIndex, setQuery]);

  useEffect(() => {
    if (!resultCount) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= resultCount) setActiveIndex(resultCount - 1);
  }, [activeIndex, resultCount, setActiveIndex]);
}
