export function scrollActiveTreeItemIntoView(container: HTMLElement | null, nodeId: string | null) {
  if (!container || !nodeId) {
    return;
  }
  const elementId = `node-treeitem-${nodeId}`;
  const treeItem = container.ownerDocument.getElementById(elementId);
  if (!treeItem || !container.contains(treeItem)) {
    return;
  }
  const targetTop = treeItem.offsetTop - container.clientHeight * 0.25;
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.max(0, Math.min(targetTop, maxScrollTop));
}
