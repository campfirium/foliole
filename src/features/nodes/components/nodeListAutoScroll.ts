export function scrollActiveTreeItemIntoView(container: HTMLElement | null, nodeId: string | null) {
  if (!container || !nodeId) {
    return;
  }
  const elementId = `node-treeitem-${nodeId}`;
  const treeItem = container.ownerDocument.getElementById(elementId);
  if (!treeItem || !container.contains(treeItem)) {
    return;
  }
  const viewportTop = container.scrollTop;
  const viewportBottom = viewportTop + container.clientHeight;
  const itemTop = treeItem.offsetTop;
  const itemBottom = itemTop + treeItem.offsetHeight;
  if (itemBottom > viewportTop && itemTop < viewportBottom) {
    return;
  }
  const targetTop = treeItem.offsetTop - container.clientHeight * 0.25;
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.max(0, Math.min(targetTop, maxScrollTop));
}
