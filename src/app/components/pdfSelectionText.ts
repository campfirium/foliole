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

function resolveSelectionPageFrame(selection: Selection): HTMLElement | null {
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const candidate = range?.commonAncestorContainer;
  if (candidate && candidate instanceof Element) {
    const frame = candidate.closest<HTMLElement>('.react-pdf__Page,[data-testid="pdf-document-page"]');
    if (frame) {
      return frame;
    }
  }
  const anchorElement = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
  if (anchorElement) {
    const frame = anchorElement.closest<HTMLElement>('.react-pdf__Page,[data-testid="pdf-document-page"]');
    if (frame) {
      return frame;
    }
  }
  const focusElement = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode?.parentElement;
  if (focusElement) {
    return focusElement.closest<HTMLElement>('.react-pdf__Page,[data-testid="pdf-document-page"]');
  }
  return null;
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function resolveSelectionRects(range: Range, pageRect: DOMRect) {
  if (pageRect.width <= 0 || pageRect.height <= 0 || typeof range.getClientRects !== 'function') {
    return [];
  }
  const seen = new Set<string>();
  const rects: Array<{ height: number; width: number; x: number; y: number }> = [];
  for (const rect of Array.from(range.getClientRects())) {
    const left = clampRatio((rect.left - pageRect.left) / pageRect.width);
    const top = clampRatio((rect.top - pageRect.top) / pageRect.height);
    const right = clampRatio((rect.right - pageRect.left) / pageRect.width);
    const bottom = clampRatio((rect.bottom - pageRect.top) / pageRect.height);
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) {
      continue;
    }
    const key = `${Math.round(left * 10000)}:${Math.round(top * 10000)}:${Math.round(width * 10000)}:${Math.round(height * 10000)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rects.push({ height, width, x: left, y: top });
  }
  return rects;
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
  const range = selection.getRangeAt(0);
  const rangeRect = range.getBoundingClientRect();
  const pageFrame = resolveSelectionPageFrame(selection);
  const pageRect = pageFrame?.getBoundingClientRect() ?? pageShell.getBoundingClientRect();
  if (pageRect.width <= 0 || pageRect.height <= 0) {
    return { page, x: 0.5, y: 0.5 };
  }
  const rects = resolveSelectionRects(range, pageRect);

  return {
    page,
    rects: rects.length > 0 ? rects : undefined,
    x: clampRatio((rangeRect.left + rangeRect.width / 2 - pageRect.left) / pageRect.width),
    y: clampRatio((rangeRect.top + rangeRect.height / 2 - pageRect.top) / pageRect.height)
  };
}
