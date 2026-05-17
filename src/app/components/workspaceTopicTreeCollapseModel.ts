import { useState, type Dispatch, type SetStateAction } from 'react';

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
    return { collapsedNodeIds: next.collapsedNodeIds, setCollapsedNodeIds };
  }

  if (state.activeNodeId !== args.activeNodeId) {
    const next = { ...state, activeNodeId: args.activeNodeId };
    setState(next);
    return { collapsedNodeIds: next.collapsedNodeIds, setCollapsedNodeIds };
  }

  return { collapsedNodeIds: state.collapsedNodeIds, setCollapsedNodeIds };
}
