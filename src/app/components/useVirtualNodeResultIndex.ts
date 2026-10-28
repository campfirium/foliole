import { useRef } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { buildVirtualNodeResultIndex, type VirtualNodeResultIndex } from '../../features/nodes/model/virtualNodeDetail';

type ResultInputs = Parameters<typeof buildVirtualNodeResultIndex>[0];
const EMPTY_TRASHED_NODE_IDS: readonly string[] = [];

function sameSearchNode(left: Node | undefined, right: Node | undefined) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.id === right.id && left.kind === right.kind && left.specialKind === right.specialKind &&
    left.anchorLink === right.anchorLink && left.title === right.title && left.content === right.content &&
    left.collections === right.collections && left.virtualFilter === right.virtualFilter &&
    left.manualChildOrder === right.manualChildOrder && left.parentNodeId === right.parentNodeId;
}

function sameSearchInputs(previous: ResultInputs, next: ResultInputs) {
  if (previous.nodeOrder !== next.nodeOrder || previous.trashedNodeIds !== next.trashedNodeIds) return false;
  return previous.nodesById === next.nodesById || next.nodeOrder.every((id) => (
    sameSearchNode(previous.nodesById[id], next.nodesById[id])
  ));
}

export function useVirtualNodeResultIndex({ nodeOrder, nodesById, trashedNodeIds = EMPTY_TRASHED_NODE_IDS }: ResultInputs) {
  const cache = useRef<{ inputs: ResultInputs; result: VirtualNodeResultIndex } | null>(null);
  const inputs = { nodeOrder, nodesById, trashedNodeIds };
  const result = cache.current && sameSearchInputs(cache.current.inputs, inputs)
    ? cache.current.result
    : buildVirtualNodeResultIndex(inputs);
  // Advance the input even on reuse so only the latest map remains held by this component.
  cache.current = { inputs, result };
  return result;
}
