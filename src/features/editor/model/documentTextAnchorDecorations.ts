import { type EditorTextAnchorDecoration } from '../adapters/EditorAdapter';

interface TextAnchorDecorationNode {
  anchorLink?: {
    kind: 'highlight' | 'cloze' | 'image-excerpt';
    locator?: unknown;
  } | null;
  id: string;
  parentNodeId: string | null;
}

interface TextAnchorLocator {
  from: number;
  originalText: string;
  to: number;
}

function isTextAnchorLocator(value: unknown): value is TextAnchorLocator {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { from?: unknown }).from === 'number' &&
      Number.isInteger((value as { from: number }).from) &&
      (value as { from: number }).from >= 0 &&
      typeof (value as { to?: unknown }).to === 'number' &&
      Number.isInteger((value as { to: number }).to) &&
      (value as { to: number }).to >= (value as { from: number }).from &&
      typeof (value as { originalText?: unknown }).originalText === 'string'
  );
}

function getTextAnchorLocators(locator: unknown): TextAnchorLocator[] {
  if (isTextAnchorLocator(locator)) {
    return [locator];
  }
  if (
    locator &&
    typeof locator === 'object' &&
    Array.isArray((locator as { ranges?: unknown }).ranges)
  ) {
    const ranges = (locator as { ranges: unknown[] }).ranges.filter(isTextAnchorLocator);
    if (ranges.length > 1 && ranges.length === (locator as { ranges: unknown[] }).ranges.length) {
      return ranges;
    }
  }
  return [];
}

function resolveUniqueOriginalTextSelection(parentContent: string, locator: TextAnchorLocator) {
  if (locator.originalText.length === 0) {
    return null;
  }

  const firstIndex = parentContent.indexOf(locator.originalText);
  if (firstIndex < 0) {
    return null;
  }
  const secondIndex = parentContent.indexOf(locator.originalText, firstIndex + Math.max(1, locator.originalText.length));
  return secondIndex < 0
    ? { from: firstIndex, to: firstIndex + locator.originalText.length }
    : null;
}

function resolveLocatorSelection(parentContent: string, locator: TextAnchorLocator) {
  const from = Math.max(0, Math.min(locator.from, parentContent.length));
  const to = Math.max(from, Math.min(locator.to, parentContent.length));
  if (parentContent.slice(from, to) === locator.originalText) {
    return { from, to };
  }
  return resolveUniqueOriginalTextSelection(parentContent, locator);
}

function resolveNodeTextAnchorDecorations(
  node: TextAnchorDecorationNode,
  parentContent: string
): EditorTextAnchorDecoration[] {
  const anchorLink = node.anchorLink;
  if (anchorLink?.kind === 'image-excerpt') return [];
  const kind = anchorLink?.kind;
  const locators = getTextAnchorLocators(anchorLink?.locator);
  if (!anchorLink || !kind || locators.length === 0) {
    return [];
  }
  return locators
    .map((locator) => resolveLocatorSelection(parentContent, locator))
    .filter((selection): selection is { from: number; to: number } => Boolean(selection && selection.from < selection.to))
    .map((selection) => ({
      from: selection.from,
      kind,
      nodeId: node.id,
      to: selection.to
    }));
}

export function collectDocumentTextAnchorDecorations(args: {
  activeNodeId: string | null;
  nodesById: Record<string, TextAnchorDecorationNode>;
  parentContent: string;
  trashedNodeIds: string[];
}) {
  if (!args.activeNodeId) {
    return [];
  }
  const trashedNodeIdSet = new Set(args.trashedNodeIds);
  return Object.values(args.nodesById)
    .filter((node) => node.parentNodeId === args.activeNodeId && !trashedNodeIdSet.has(node.id))
    .flatMap((node) => resolveNodeTextAnchorDecorations(node, args.parentContent));
}
