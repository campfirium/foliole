import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';

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

function resolveSelectionPageShell(selection: Selection): HTMLElement | null {
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const candidate = range?.commonAncestorContainer;
  if (candidate && candidate instanceof Element) {
    const shell = candidate.closest<HTMLElement>('[data-pdf-page-number]');
    if (shell) {
      return shell;
    }
  }
  const anchorElement = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
  if (anchorElement) {
    const shell = anchorElement.closest<HTMLElement>('[data-pdf-page-number]');
    if (shell) {
      return shell;
    }
  }
  const focusElement = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode?.parentElement;
  if (focusElement) {
    return focusElement.closest<HTMLElement>('[data-pdf-page-number]');
  }
  return null;
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function resolvePdfSelectionLocator(container: HTMLElement | null, selection: Selection | null): NodeAnchorLink['locator'] {
  if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
    return undefined;
  }
  if (!isSelectionNodeInside(container, selection.anchorNode) || !isSelectionNodeInside(container, selection.focusNode)) {
    return undefined;
  }
  const pageShell = resolveSelectionPageShell(selection);
  const pageFromData = pageShell?.dataset.pdfPageNumber;
  const page = pageFromData ? Number(pageFromData) : NaN;
  if (!pageShell || !Number.isInteger(page) || page < 1) {
    return undefined;
  }
  const rangeRect = selection.getRangeAt(0).getBoundingClientRect();
  const pageRect = pageShell.getBoundingClientRect();
  if (pageRect.width <= 0 || pageRect.height <= 0) {
    return { page, x: 0.5, y: 0.5 };
  }

  return {
    page,
    x: clampRatio((rangeRect.left + rangeRect.width / 2 - pageRect.left) / pageRect.width),
    y: clampRatio((rangeRect.top + rangeRect.height / 2 - pageRect.top) / pageRect.height)
  };
}
