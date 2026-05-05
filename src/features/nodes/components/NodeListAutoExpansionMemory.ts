import { useEffect, useMemo, useState } from 'react';

import type { NodeTreeRow } from '../model/nodeTree';
import {
  buildDefaultCollapsedNodeIds,
  collectAutoExpandedNodeIds
} from '../model/nodeTreeAutoCollapse';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

export function useDefaultCollapsedNoteNodeIds(
  nodesById: WorkspaceListNodesById,
  noteRowsAll: NodeTreeRow[]
) {
  return useMemo(
    () =>
      buildDefaultCollapsedNodeIds({
        nodesById,
        rows: noteRowsAll
      }),
    [nodesById, noteRowsAll]
  );
}

export function useAutoExpandedNoteNodeIds(
  activeNodeId: string | null,
  nodesById: WorkspaceListNodesById,
  noteParentById: Record<string, string | null>,
  noteRowsAll: NodeTreeRow[]
) {
  return useMemo(
    () =>
      collectAutoExpandedNodeIds({
        activeNodeId,
        nodesById,
        parentById: noteParentById,
        rows: noteRowsAll
      }),
    [activeNodeId, nodesById, noteParentById, noteRowsAll]
  );
}

export function useStickyAutoExpandedNodeIds(
  autoExpandedNodeIds: ReadonlySet<string>,
  collapsibleNodeIds: ReadonlySet<string>
) {
  const [rememberedNodeIds, setRememberedNodeIds] = useState<string[]>([]);

  useEffect(() => {
    setRememberedNodeIds((previous) => {
      const next = new Set(previous.filter((nodeId) => collapsibleNodeIds.has(nodeId)));
      autoExpandedNodeIds.forEach((nodeId) => {
        if (collapsibleNodeIds.has(nodeId)) {
          next.add(nodeId);
        }
      });
      return [...next];
    });
  }, [autoExpandedNodeIds, collapsibleNodeIds]);

  return useMemo(() => {
    const next = new Set(rememberedNodeIds.filter((nodeId) => collapsibleNodeIds.has(nodeId)));
    autoExpandedNodeIds.forEach((nodeId) => {
      if (collapsibleNodeIds.has(nodeId)) {
        next.add(nodeId);
      }
    });
    return next;
  }, [autoExpandedNodeIds, collapsibleNodeIds, rememberedNodeIds]);
}
