import { useCallback, useEffect, useState } from 'react';

import { collectRangeNodeIds, type NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

export function useWorkspaceTopicTreeSelection(args: {
  activeNodeId: string | null;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
  rowIds: string[];
}) {
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(args.activeNodeId ? [args.activeNodeId] : []);
  const [selectionAnchorNodeId, setSelectionAnchorNodeId] = useState<string | null>(args.activeNodeId);

  useEffect(() => {
    setSelectedNodeIds((prev) => prev.filter((nodeId) => Boolean(args.nodesById[nodeId])));
    setSelectionAnchorNodeId((prev) => (prev && args.nodesById[prev] ? prev : null));
  }, [args.nodesById]);

  useEffect(() => {
    if (!args.activeNodeId) return;
    setSelectedNodeIds((prev) => (prev.includes(args.activeNodeId!) ? prev : [args.activeNodeId!]));
    setSelectionAnchorNodeId(args.activeNodeId);
  }, [args.activeNodeId]);

  const handleSelectNode = useCallback((nodeId: string, modifiers?: NodeSelectModifiers) => {
    const fallbackAnchor = args.activeNodeId ?? nodeId;
    if (modifiers?.shiftKey) {
      setSelectedNodeIds(collectRangeNodeIds(args.rowIds, selectionAnchorNodeId ?? fallbackAnchor, nodeId));
      args.onSelectNode(nodeId);
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
