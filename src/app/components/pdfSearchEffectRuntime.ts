import type { PdfSearchRequest, PdfSearchTarget, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfSearchMatch } from './pdfSearchMatchCollection';

export function scrollToMatch(container: HTMLDivElement, match: PdfSearchMatch) {
  const shell = container.querySelector<HTMLElement>(`[data-pdf-page-number="${match.page}"]`);
  if (!shell) {
    return;
  }
  if (typeof match.y === 'number') {
    const rawTop = shell.offsetTop + shell.clientHeight * match.y - container.clientHeight * 0.36;
    const top = Math.max(0, rawTop);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ behavior: 'smooth', top });
    } else {
      container.scrollTop = top;
    }
    return;
  }
  const containerRect = container.getBoundingClientRect();
  const targetRect = match.element.getBoundingClientRect();
  const rawTop = container.scrollTop + (targetRect.top - containerRect.top) - container.clientHeight * 0.36;
  const top = Math.max(0, rawTop);
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ behavior: 'smooth', top });
  } else {
    container.scrollTop = top;
  }
}

export function canScrollToMatch(match: PdfSearchMatch, shell: HTMLElement | null) {
  if (typeof match.x === 'number' && typeof match.y === 'number') {
    return true;
  }
  return !!shell && match.element !== shell;
}

export function toSearchHighlights(matches: PdfSearchMatch[], activeMatchId: string): PdfSearchVisualHighlight[] {
  return matches.map((match) => ({
    id: match.id,
    isActive: match.id === activeMatchId,
    page: match.page,
    rects: match.rects,
    x: match.x,
    y: match.y
  }));
}

export function resolveNextCursor(request: PdfSearchRequest | null, current: number, total: number) {
  if (!request) {
    return current;
  }
  if (request.direction === 'previous') {
    return (current - 1 + total) % total;
  }
  return (current + 1) % total;
}

export function resolveTargetCursor(matches: PdfSearchMatch[], target: PdfSearchTarget) {
  const exactIndex = matches.findIndex((match) => match.page === target.page && match.matchStart === target.matchStart);
  if (exactIndex >= 0) {
    return exactIndex;
  }
  const samePage = matches
    .map((match, index) => ({ index, match }))
    .filter((entry) => entry.match.page === target.page);
  if (samePage.length === 0) {
    return 0;
  }
  samePage.sort(
    (left, right) => Math.abs(left.match.matchStart - target.matchStart) - Math.abs(right.match.matchStart - target.matchStart)
  );
  return samePage[0]?.index ?? 0;
}

export function resetSearchCursorState(args: {
  cursorRef: { current: number };
  lastHandledTargetIdRef: { current: number | null };
  lastRequestIdRef: { current: number | null };
  lastQueryRef: { current: string };
  query: string;
}) {
  args.cursorRef.current = 0;
  args.lastHandledTargetIdRef.current = null;
  args.lastRequestIdRef.current = null;
  args.lastQueryRef.current = args.query;
}

export function resolveCursorByRequest(args: {
  cursorRef: { current: number };
  lastHandledTargetIdRef: { current: number | null };
  lastQueryRef: { current: string };
  lastRequestIdRef: { current: number | null };
  matches: PdfSearchMatch[];
  query: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
}) {
  let handledAction: { id: number; kind: 'request' | 'target' } | null = null;
  const queryChanged = args.lastQueryRef.current !== args.query;

  if (queryChanged) {
    args.cursorRef.current = 0;
    args.lastHandledTargetIdRef.current = null;
    args.lastRequestIdRef.current = null;
  }

  if (args.searchTarget && (queryChanged || args.searchTarget.id !== args.lastHandledTargetIdRef.current)) {
    args.cursorRef.current = resolveTargetCursor(args.matches, args.searchTarget);
    handledAction = { id: args.searchTarget.id, kind: 'target' };
  } else if (args.searchRequest && args.searchRequest.id !== args.lastRequestIdRef.current) {
    args.cursorRef.current = resolveNextCursor(args.searchRequest, args.cursorRef.current, args.matches.length);
    args.lastRequestIdRef.current = args.searchRequest.id;
    handledAction = { id: args.searchRequest.id, kind: 'request' };
  }
  args.lastQueryRef.current = args.query;
  return { handledAction, queryChanged };
}
