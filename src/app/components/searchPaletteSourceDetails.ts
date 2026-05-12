import { useEffect, useRef, useState } from 'react';

import {
  loadRuntimeNodeSourceDetails,
  type RuntimeNodeSourceDetails
} from '../../shared/platform/nodeSourceRuntimeRepository';

import type { WorkspaceSearchResult } from './workspaceSearch';

export function useSearchResultSourceDetails(results: WorkspaceSearchResult[]) {
  const [sourceDetailsByNodeId, setSourceDetailsByNodeId] = useState<
    Record<string, RuntimeNodeSourceDetails | null | undefined>
  >({});
  const cacheRef = useRef<Record<string, RuntimeNodeSourceDetails | null>>({});

  useEffect(() => {
    const nodeIds = [
      ...new Set(
        results
          .filter((result) => result.kind === 'node' || result.kind === 'pdf')
          .map((result) => result.id)
          .filter(Boolean)
      )
    ];
    if (nodeIds.length === 0) {
      setSourceDetailsByNodeId((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }

    setSourceDetailsByNodeId((current) => {
      const nextEntries = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, cacheRef.current[nodeId]]));
      const currentKeys = Object.keys(current);
      if (currentKeys.length === nodeIds.length && nodeIds.every((nodeId) => current[nodeId] === nextEntries[nodeId])) {
        return current;
      }
      return nextEntries;
    });

    const missingNodeIds = nodeIds.filter((nodeId) => !Object.prototype.hasOwnProperty.call(cacheRef.current, nodeId));
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
        setSourceDetailsByNodeId((current) => (current[nodeId] === details ? current : { ...current, [nodeId]: details }));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [results]);

  return sourceDetailsByNodeId;
}
