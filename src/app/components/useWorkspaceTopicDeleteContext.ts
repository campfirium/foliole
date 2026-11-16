import { useLayoutEffect, useRef } from 'react';

import { registerWorkspaceTopicDeleteContext } from '../../features/nodes/components/nodeListDeleteAction';
import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';

export function useWorkspaceTopicDeleteContext(
  folderId: string | undefined,
  activeNodeId: string | null,
  rows: readonly NodeTreeRow[]
) {
  const rowsRef = useRef(rows);
  useLayoutEffect(() => { rowsRef.current = rows; }, [rows]);
  useLayoutEffect(() => {
    if (!folderId || !activeNodeId) return;
    let current = true;
    const unregister = registerWorkspaceTopicDeleteContext(nodeIds => {
      if (!nodeIds.includes(activeNodeId)) return;
      const roots = rowsRef.current.filter(row => row.depth === 0);
      const index = roots.findIndex(row => row.node.id === activeNodeId);
      if (index < 0) return;
      const candidates = [...roots.slice(index + 1), ...roots.slice(0, index).reverse()].map(row => row.node.id);
      return {
        activeNodeId,
        folderId,
        candidates,
        isCurrent: () => current,
        getListedIds: () => new Set(rowsRef.current.filter(row => row.depth === 0).map(row => row.node.id))
      };
    });
    return () => {
      current = false;
      unregister();
    };
  }, [activeNodeId, folderId]);
}
