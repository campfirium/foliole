function findTreeItemInContainer(container: HTMLElement, nodeId: string) {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="treeitem"][data-node-id]'))
    .find((treeItem) => treeItem.dataset.nodeId === nodeId) ?? null;
}

function hasMeasuredRect(rect: DOMRect) {
  return rect.top !== 0 || rect.bottom !== 0 || rect.height !== 0;
}

function resolveTreeItemPosition(container: HTMLElement, treeItem: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const itemRect = treeItem.getBoundingClientRect();
  if (hasMeasuredRect(containerRect) || hasMeasuredRect(itemRect)) {
    const top = container.scrollTop + itemRect.top - containerRect.top;
    return {
      bottom: top + (itemRect.height || treeItem.offsetHeight),
      top
    };
  }
  return {
    bottom: treeItem.offsetTop + treeItem.offsetHeight,
    top: treeItem.offsetTop
  };
}

export function scrollActiveTreeItemIntoView(container: HTMLElement | null, nodeId: string | null) {
  if (!container || !nodeId) {
    return;
  }
  const treeItem = findTreeItemInContainer(container, nodeId);
  if (!treeItem) {
    return;
  }
  const viewportTop = container.scrollTop;
  const viewportBottom = viewportTop + container.clientHeight;
  const { bottom: itemBottom, top: itemTop } = resolveTreeItemPosition(container, treeItem);
  if (itemBottom > viewportTop && itemTop < viewportBottom) {
    return;
  }
  const targetTop = itemTop - container.clientHeight * COMFORT_SCROLL_ANCHOR_RATIO;
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.max(0, Math.min(targetTop, maxScrollTop));
}
const COMFORT_SCROLL_ANCHOR_RATIO = 0.38;
