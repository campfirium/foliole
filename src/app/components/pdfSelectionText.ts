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

function mergeClientRects(rects: DOMRect[]) {
  const merged: DOMRect[] = [];
  const sortedRects = [...rects].sort((left, right) => (left.top === right.top ? left.left - right.left : left.top - right.top));
  for (const rect of sortedRects) {
    const previousRect = merged.at(-1);
    if (!previousRect) {
      merged.push(rect);
      continue;
    }
    const sameRow = Math.abs(previousRect.top - rect.top) <= 3 && Math.abs(previousRect.bottom - rect.bottom) <= 3;
    const touching = rect.left - previousRect.right <= 6;
    if (!sameRow || !touching) {
      merged.push(rect);
      continue;
    }
    merged[merged.length - 1] = new DOMRect(
      previousRect.left,
      Math.min(previousRect.top, rect.top),
      Math.max(previousRect.right, rect.right) - previousRect.left,
      Math.max(previousRect.bottom, rect.bottom) - Math.min(previousRect.top, rect.top)
    );
  }
  return merged;
}

function resolveLargestRectCluster(
  rects: Array<{ height: number; width: number; x: number; y: number }>
) {
  if (rects.length <= 1) {
    return rects;
  }
  const sorted = [...rects].sort((left, right) => (left.y === right.y ? left.x - right.x : left.y - right.y));
  const clusters: Array<Array<{ height: number; width: number; x: number; y: number }>> = [];
  let currentCluster: Array<{ height: number; width: number; x: number; y: number }> = [sorted[0]];
  for (let index = 1; index < sorted.length; index += 1) {
    const currentRect = sorted[index];
    const previousRect = currentCluster[currentCluster.length - 1];
    const rowGap = currentRect.y - (previousRect.y + previousRect.height);
    const threshold = Math.max(previousRect.height * 0.9, 0.018);
    if (rowGap > threshold) {
      clusters.push(currentCluster);
      currentCluster = [currentRect];
      continue;
    }
    currentCluster.push(currentRect);
  }
  clusters.push(currentCluster);
  if (clusters.length === 1) {
    return rects;
  }
  const largestCluster = clusters.reduce((best, candidate) => {
    const candidateArea = candidate.reduce((sum, rect) => sum + rect.width * rect.height, 0);
    const bestArea = best.reduce((sum, rect) => sum + rect.width * rect.height, 0);
    return candidateArea > bestArea ? candidate : best;
  });
  return largestCluster;
}

function resolveSelectionRects(range: Range, pageRect: DOMRect) {
  if (pageRect.width <= 0 || pageRect.height <= 0 || typeof range.getClientRects !== 'function') {
    return [];
  }
  const seen = new Set<string>();
  const rects: Array<{ height: number; width: number; x: number; y: number }> = [];
  const mergedRects = mergeClientRects(Array.from(range.getClientRects()).map((rect) => new DOMRect(rect.left, rect.top, rect.width, rect.height)));
  for (const rect of mergedRects) {
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
  return resolveLargestRectCluster(rects);
}

function resolveRangeBoundingRect(range: Range): DOMRect | null {
  if (typeof range.getBoundingClientRect === 'function') {
    return range.getBoundingClientRect();
  }
  if (typeof range.getClientRects !== 'function') {
    return null;
  }
  const firstRect = Array.from(range.getClientRects())[0];
  if (!firstRect) {
    return null;
  }
  return new DOMRect(firstRect.x, firstRect.y, firstRect.width, firstRect.height);
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
  const pageFrame = resolveSelectionPageFrame(selection);
  const pageRect = pageFrame?.getBoundingClientRect() ?? pageShell.getBoundingClientRect();
  if (pageRect.width <= 0 || pageRect.height <= 0) {
    return { page, x: 0.5, y: 0.5 };
  }
  const rangeRect = resolveRangeBoundingRect(range) ?? pageRect;
  const rects = resolveSelectionRects(range, pageRect);

  return {
    page,
    rects: rects.length > 0 ? rects : undefined,
    x: clampRatio((rangeRect.left + rangeRect.width / 2 - pageRect.left) / pageRect.width),
    y: clampRatio((rangeRect.top + rangeRect.height / 2 - pageRect.top) / pageRect.height)
  };
}
