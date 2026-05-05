function isSelectionNodeInside(container: HTMLElement, node: Node | null) {
  if (!node) {
    return false;
  }
  const normalizedNode = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  if (!normalizedNode) {
    return false;
  }
  return container.contains(normalizedNode);
}

export function resolvePdfSelectionText(container: HTMLElement | null, selection: Selection | null) {
  if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
    return '';
  }

  if (!isSelectionNodeInside(container, selection.anchorNode) || !isSelectionNodeInside(container, selection.focusNode)) {
    return '';
  }

  return selection.toString().trim();
}
