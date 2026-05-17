import { useState, type Dispatch, type SetStateAction } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

export function collectActiveAncestorIds(activeNodeId: string | null, rootIds: readonly string[], nodesById: WorkspaceListNodesById) {
  if (!activeNodeId) return new Set<string>();
  const rootIdSet = new Set(rootIds);
  const ancestors: string[] = [];
  let currentId = nodesById[activeNodeId]?.parentNodeId ?? null;
  while (currentId) {
    ancestors.push(currentId);
    if (rootIdSet.has(currentId)) {
      return new Set(ancestors);
    }
    currentId = nodesById[currentId]?.parentNodeId ?? null;
  }
  return rootIdSet.has(activeNodeId) ? new Set<string>() : new Set<string>();
}

interface TopicCollapseState {
  activeFolderId: string;
  activeNodeId: string | null;
  collapsedNodeIds: Set<string>;
}

function updateCollapsedNodeIds(
  setState: Dispatch<SetStateAction<TopicCollapseState>>,
  value: Set<string> | ((current: Set<string>) => Set<string>)
) {
  setState((current) => ({
    ...current,
    collapsedNodeIds: typeof value === 'function' ? value(current.collapsedNodeIds) : value
  }));
}

export function useCollapsedTopicNodeIds(args: {
  activeFolderId: string;
  activeNodeId: string | null;
  collapsibleNodeIds: string[];
  expandedNodeIds: ReadonlySet<string>;
}) {
  const [state, setState] = useState(() => ({
    activeFolderId: args.activeFolderId,
    activeNodeId: args.activeNodeId,
    collapsedNodeIds: new Set(args.collapsibleNodeIds.filter((nodeId) => !args.expandedNodeIds.has(nodeId)))
  }));
  const setCollapsedNodeIds = (value: Set<string> | ((current: Set<string>) => Set<string>)) =>
    updateCollapsedNodeIds(setState, value);

  if (state.activeFolderId !== args.activeFolderId) {
    const next = {
      activeFolderId: args.activeFolderId,
      activeNodeId: args.activeNodeId,
      collapsedNodeIds: new Set(args.collapsibleNodeIds.filter((nodeId) => !args.expandedNodeIds.has(nodeId)))
    };
    setState(next);
    return { collapsedNodeIds: next.collapsedNodeIds, setCollapsedNodeIds };
  }

  if (state.activeNodeId !== args.activeNodeId) {
    const nextCollapsedNodeIds = new Set(state.collapsedNodeIds);
    args.expandedNodeIds.forEach((nodeId) => nextCollapsedNodeIds.delete(nodeId));
    const next = { ...state, activeNodeId: args.activeNodeId, collapsedNodeIds: nextCollapsedNodeIds };
    setState(next);
    return { collapsedNodeIds: next.collapsedNodeIds, setCollapsedNodeIds };
  }

  return { collapsedNodeIds: state.collapsedNodeIds, setCollapsedNodeIds };
}
