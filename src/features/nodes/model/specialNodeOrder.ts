export function normalizeInjectedRootNodeOrder(
  nodeOrder: string[],
  injectedRootNodeIds: readonly string[]
) {
  if (injectedRootNodeIds.every((nodeId) => nodeOrder.includes(nodeId))) {
    return nodeOrder;
  }
  return [
    ...injectedRootNodeIds,
    ...nodeOrder.filter((nodeId) => !injectedRootNodeIds.includes(nodeId))
  ];
}
