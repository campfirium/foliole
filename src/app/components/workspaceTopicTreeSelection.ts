import { useCallback, useEffect, useState } from 'react';

import { collectRangeNodeIds, type NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

export function useWorkspaceTopicTreeSelection(args: {
  activeNodeId: string | null;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
  rowIds: string[];
}) {
  const rowIdsKey = args.rowIds.join('\0');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(args.activeNodeId ? [args.activeNodeId] : []);
  const [selectionAnchorNodeId, setSelectionAnchorNodeId] = useState<string | null>(args.activeNodeId);

  useEffect(() => {
    const rowIdSet = new Set(rowIdsKey ? rowIdsKey.split('\0') : []);
    setSelectedNodeIds((prev) => {
      const next = prev.filter((nodeId) => rowIdSet.has(nodeId) && Boolean(args.nodesById[nodeId]));
      return next.length === prev.length ? prev : next;
    });
    setSelectionAnchorNodeId((prev) => (prev && rowIdSet.has(prev) && args.nodesById[prev] ? prev : null));
  }, [args.nodesById, rowIdsKey]);

  useEffect(() => {
    if (!args.activeNodeId) return;
    setSelectedNodeIds((prev) => {
      if (prev.includes(args.activeNodeId!)) {
        setSelectionAnchorNodeId((anchor) => anchor ?? args.activeNodeId);
        return prev;
      }
      setSelectionAnchorNodeId(args.activeNodeId);
      return [args.activeNodeId!];
    });
  }, [args.activeNodeId]);

  const handleSelectNode = useCallback((nodeId: string, modifiers?: NodeSelectModifiers) => {
    const fallbackAnchor = args.activeNodeId && args.rowIds.includes(args.activeNodeId) ? args.activeNodeId : nodeId;
    if (modifiers?.shiftKey) {
      setSelectedNodeIds(collectRangeNodeIds(args.rowIds, selectionAnchorNodeId ?? fallbackAnchor, nodeId));
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
      args.onSelectNode(nodeId);
      return;
    }
    setSelectedNodeIds([nodeId]);
    setSelectionAnchorNodeId(nodeId);
    args.onSelectNode(nodeId);
  }, [args, selectionAnchorNodeId]);

  return { handleSelectNode, selectedNodeIds, selectionAnchorNodeId, setSelectedNodeIds, setSelectionAnchorNodeId };
}
