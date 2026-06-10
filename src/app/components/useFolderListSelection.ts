import { useCallback, useEffect, useMemo, useState } from 'react';

import { collectRangeNodeIds, type NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import type { Node } from '../../features/nodes/model/nodeTypes';

export function useFolderListSelection(args: {
  activeNodeId?: string | null | undefined;
  filteredNodes: Node[];
  onSelectNode: (nodeId: string) => void;
}) {
  const { activeNodeId, filteredNodes, onSelectNode } = args;
  const rowIds = useMemo(() => filteredNodes.map((node) => node.id), [filteredNodes]);
  const rowIdsKey = rowIds.join('\0');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(activeNodeId ? [activeNodeId] : []);
  const [selectionAnchorNodeId, setSelectionAnchorNodeId] = useState<string | null>(activeNodeId ?? null);

  useEffect(() => {
    const rowIdSet = new Set(rowIdsKey ? rowIdsKey.split('\0') : []);
    setSelectedNodeIds((prev) => {
      const next = prev.filter((nodeId) => rowIdSet.has(nodeId));
      return next.length === prev.length ? prev : next;
    });
    setSelectionAnchorNodeId((prev) => (prev && rowIdSet.has(prev) ? prev : null));
  }, [rowIdsKey]);

  useEffect(() => {
    if (!activeNodeId) return;
    setSelectedNodeIds((prev) => {
      if (prev.includes(activeNodeId)) {
        setSelectionAnchorNodeId((anchor) => anchor ?? activeNodeId);
        return prev;
      }
      setSelectionAnchorNodeId(activeNodeId);
      return [activeNodeId];
    });
  }, [activeNodeId]);

  const handleSelectNode = useCallback((nodeId: string, modifiers?: NodeSelectModifiers) => {
    const fallbackAnchor = activeNodeId && rowIds.includes(activeNodeId) ? activeNodeId : nodeId;
    if (modifiers?.shiftKey) {
      setSelectedNodeIds(collectRangeNodeIds(rowIds, selectionAnchorNodeId ?? fallbackAnchor, nodeId));
      return;
    }
    if (modifiers?.metaKey || modifiers?.ctrlKey) {
      setSelectedNodeIds((prev) => {
        if (prev.includes(nodeId) && prev.length > 1) {
          return prev.filter((id) => id !== nodeId);
        }
        return prev.includes(nodeId) ? prev : [...prev, nodeId];
      });
      setSelectionAnchorNodeId(nodeId);
      onSelectNode(nodeId);
      return;
    }
    setSelectedNodeIds([nodeId]);
    setSelectionAnchorNodeId(nodeId);
    onSelectNode(nodeId);
  }, [activeNodeId, onSelectNode, rowIds, selectionAnchorNodeId]);

  return { handleSelectNode, selectedNodeIds };
}
