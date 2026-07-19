export function sortNodeIdsByVisibleOrder(nodeIds: string[], visibleNodeIds: string[]) {
  return [...nodeIds].sort((leftId, rightId) =>
    visibleNodeIds.indexOf(leftId) - visibleNodeIds.indexOf(rightId));
}
