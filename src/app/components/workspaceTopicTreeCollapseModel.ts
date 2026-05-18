import { useState, type Dispatch, type SetStateAction } from 'react';

interface TopicCollapseState {
  activeFolderId: string;
  activeNodeId: string | null;
  collapsedNodeIds: Set<string>;
}

function collectForcedOpenNodeIds(
  nodeId: string | null | undefined,
  childrenByParent: ReadonlyMap<string | null, string[]>,
  parentIdByNodeId: ReadonlyMap<string, string | null>
) {
  const nodeIds = new Set<string>();
  let currentNodeId = nodeId ? parentIdByNodeId.get(nodeId) ?? null : null;

  while (currentNodeId) {
    if (nodeIds.has(currentNodeId)) break;
    nodeIds.add(currentNodeId);
    currentNodeId = parentIdByNodeId.get(currentNodeId) ?? null;
  }

  if (nodeId) {
    collectDescendantNodeIds(nodeId, childrenByParent, nodeIds);
  }

  return nodeIds;
}

function collectDescendantNodeIds(
  nodeId: string,
  childrenByParent: ReadonlyMap<string | null, string[]>,
  nodeIds: Set<string>
) {
  if (nodeIds.has(nodeId)) return;
  nodeIds.add(nodeId);
  for (const childNodeId of childrenByParent.get(nodeId) ?? []) {
    collectDescendantNodeIds(childNodeId, childrenByParent, nodeIds);
  }
}

function removeForcedOpenNodeIds(
  collapsedNodeIds: Set<string>,
  forcedOpenNodeIds: ReadonlySet<string>
) {
  if (forcedOpenNodeIds.size === 0) {
    return collapsedNodeIds;
  }

  return new Set(
    [...collapsedNodeIds].filter((nodeId) => !forcedOpenNodeIds.has(nodeId))
  );
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
  childrenByParent: ReadonlyMap<string | null, string[]>;
  collapsibleNodeIds: string[];
  forceVisibleNodeId?: string | null;
  parentIdByNodeId: ReadonlyMap<string, string | null>;
}) {
  const [state, setState] = useState(() => ({
    activeFolderId: args.activeFolderId,
    activeNodeId: args.activeNodeId,
    collapsedNodeIds: new Set(args.collapsibleNodeIds)
  }));
  const setCollapsedNodeIds = (value: Set<string> | ((current: Set<string>) => Set<string>)) =>
    updateCollapsedNodeIds(setState, value);

  if (state.activeFolderId !== args.activeFolderId) {
    const next = {
      activeFolderId: args.activeFolderId,
      activeNodeId: args.activeNodeId,
      collapsedNodeIds: new Set(args.collapsibleNodeIds)
    };
    setState(next);
    return {
      collapsedNodeIds: removeForcedOpenNodeIds(
        next.collapsedNodeIds,
        collectForcedOpenNodeIds(args.forceVisibleNodeId, args.childrenByParent, args.parentIdByNodeId)
      ),
      setCollapsedNodeIds
    };
  }

  if (state.activeNodeId !== args.activeNodeId) {
    const next = { ...state, activeNodeId: args.activeNodeId };
    setState(next);
    return {
      collapsedNodeIds: removeForcedOpenNodeIds(
        next.collapsedNodeIds,
        collectForcedOpenNodeIds(args.forceVisibleNodeId, args.childrenByParent, args.parentIdByNodeId)
      ),
      setCollapsedNodeIds
    };
  }

  return {
    collapsedNodeIds: removeForcedOpenNodeIds(
      state.collapsedNodeIds,
      collectForcedOpenNodeIds(args.forceVisibleNodeId, args.childrenByParent, args.parentIdByNodeId)
    ),
    setCollapsedNodeIds
  };
}
