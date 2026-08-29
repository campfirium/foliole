import { isPdfAnchorLocator, type Node } from '../../features/nodes/model/nodeTypes';

import { resolveExistingExcerptNode } from './existingExcerptTarget';

export const PDF_HIGHLIGHT_TARGET_SELECTOR = '[data-pdf-highlight-node-id]';

function containsPoint(rect: DOMRect, x: number, y: number) {
  return rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function findPdfHighlightTargetAtPoint(x: number, y: number) {
  const matches = Array.from(document.querySelectorAll<HTMLElement>(PDF_HIGHLIGHT_TARGET_SELECTOR))
    .filter((element) => containsPoint(element.getBoundingClientRect(), x, y));
  const nodeIds = new Set(matches.map((element) => element.dataset.pdfHighlightNodeId).filter(Boolean));
  return nodeIds.size === 1 ? matches[0] ?? null : null;
}

export function getPdfHighlightTarget(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(PDF_HIGHLIGHT_TARGET_SELECTOR) : null;
}

export function resolvePdfExistingHighlight(input: {
  activeNodeId: string;
  nodesById: Record<string, Node>;
  target: HTMLElement;
  trashedNodeIds: string[];
}) {
  const node = resolvePdfExistingHighlightNode(input);
  return node ? resolveExistingExcerptNode(node, { canAdjustRange: false }) : null;
}

export function resolvePdfExistingHighlightNode(input: {
  activeNodeId: string;
  nodesById: Record<string, Node>;
  target: HTMLElement;
  trashedNodeIds: string[];
}) {
  const nodeId = input.target.dataset.pdfHighlightNodeId;
  const node = nodeId ? input.nodesById[nodeId] : null;
  const anchor = node?.anchorLink;
  if (
    !node ||
    node.parentNodeId !== input.activeNodeId ||
    input.trashedNodeIds.includes(node.id) ||
    (anchor?.kind !== 'highlight' && anchor?.kind !== 'image-excerpt') ||
    !isPdfAnchorLocator(anchor.locator)
  ) {
    return null;
  }
  return node;
}
