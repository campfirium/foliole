import type { StoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';

import { renderMarkedSource } from './articleMirrorMarkup.js';

interface MirrorNode {
  anchorLink: StoredAnchorLink | null;
  content: string;
}

interface LocatorMirrorSpan {
  anchorId: string;
  from: number;
  kind: 'highlight' | 'cloze';
  sourceText: string;
  to: number;
  located: boolean;
  noteSourceText: string;
}

function isLocatorMirrorSpan(span: LocatorMirrorSpan | null): span is LocatorMirrorSpan {
  return span !== null && span.sourceText.length > 0;
}

function renderMirrorBoundary(kind: 'highlight' | 'cloze', slash: boolean) {
  if (kind === 'highlight') {
    return '==';
  }
  return slash ? '</u>' : '<u>';
}

function resolveTextMirrorLocator(
  locator: StoredAnchorLink['locator']
): { from: number; originalText?: string; to: number } | null {
  if (!locator) {
    return null;
  }
  if ('ranges' in locator) {
    const range = locator.ranges[0];
    return range
      ? { from: range.from, originalText: range.originalText, to: range.to }
      : null;
  }
  if ('from' in locator && 'to' in locator && typeof locator.from === 'number' && typeof locator.to === 'number') {
    return {
      from: locator.from,
      ...('originalText' in locator ? { originalText: locator.originalText } : {}),
      to: locator.to
    };
  }
  return null;
}

function collectAnchorSpans(articleContent: string, key: string, linkedChildren: MirrorNode[]) {
  const [kind, anchorId] = key.split(':') as ['highlight' | 'cloze', string];
  const locator = linkedChildren.find(
    (child) => resolveTextMirrorLocator(child.anchorLink?.locator) !== null
  )?.anchorLink?.locator;
  const first = resolveTextMirrorLocator(locator);
  const groupedHighlight = kind === 'highlight' && locator && 'ranges' in locator;
  const ranges = groupedHighlight ? locator.ranges : first ? [first] : [];
  const spans = ranges.map((range) => {
    const { from, to } = range;
    const inBounds = Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to > from && to <= articleContent.length;
    const source = inBounds ? articleContent.slice(from, to) : '';
    const located = inBounds && (!groupedHighlight || source === range.originalText);
    if (!located && kind !== 'highlight') return null;
    return { anchorId, from, kind, located, noteSourceText: '',
      sourceText: located ? source : range.originalText ?? '', to } satisfies LocatorMirrorSpan;
  }).filter(isLocatorMirrorSpan);
  const noteSourceText = spans.map((span) => span.sourceText).join('\n');
  return spans.map((span) => ({ ...span, noteSourceText }));
}

function collectLocatorMirrorSpans(articleContent: string, derivedByAnchorKey: Map<string, MirrorNode[]>) {
  return [...derivedByAnchorKey.entries()]
    .filter(([key]) => key.startsWith('highlight:') || key.startsWith('cloze:'))
    .flatMap(([key, children]) => collectAnchorSpans(articleContent, key, children))
    .sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));
}

function hasTouchingLocatorMirrorSpans(spans: ReadonlyArray<LocatorMirrorSpan>) {
  let maxTo = -1;
  for (const span of spans) {
    if (span.from <= maxTo) {
      return true;
    }
    maxTo = Math.max(maxTo, span.to);
  }
  return false;
}

function renderArticleBodyFromOverlappingLocators(input: {
  articleContent: string;
  createExtraNote: (span: LocatorMirrorSpan) => string;
  spans: ReadonlyArray<LocatorMirrorSpan>;
}) {
  const openings = new Map<number, LocatorMirrorSpan[]>();
  const closings = new Map<number, LocatorMirrorSpan[]>();

  for (const span of input.spans) {
    const startEntries = openings.get(span.from) ?? [];
    startEntries.push(span);
    openings.set(span.from, startEntries);

    const endEntries = closings.get(span.to) ?? [];
    endEntries.push(span);
    closings.set(span.to, endEntries);
  }

  const parts: string[] = [];
  for (let position = 0; position <= input.articleContent.length; position += 1) {
    const ending = closings.get(position);
    if (ending) {
      ending
        .sort((left, right) => {
          if (left.to !== right.to) {
            return left.to - right.to;
          }
          return right.from - left.from;
        })
        .forEach((span) => {
          parts.push(renderMirrorBoundary(span.kind, true));
          parts.push(input.createExtraNote(span));
        });
    }

    const starting = openings.get(position);
    if (starting) {
      starting
        .sort((left, right) => {
          if (left.from !== right.from) {
            return left.from - right.from;
          }
          return right.to - left.to;
        })
        .forEach((span) => parts.push(renderMirrorBoundary(span.kind, false)));
    }

    if (position < input.articleContent.length) {
      parts.push(input.articleContent[position] ?? '');
    }
  }

  return parts.join('');
}

export function renderArticleBodyFromLocators(input: {
  articleContent: string;
  createExtraNote: (span: LocatorMirrorSpan) => string;
  derivedByAnchorKey: Map<string, MirrorNode[]>;
}) {
  const allSpans = collectLocatorMirrorSpans(input.articleContent, input.derivedByAnchorKey);
  const spans = allSpans.filter((span) => span.located);
  const noted = new Set<string>();
  const createExtraNote = (span: LocatorMirrorSpan) => {
    const key = `${span.kind}:${span.anchorId}`;
    if (noted.has(key)) return '';
    noted.add(key);
    return input.createExtraNote({ ...span, sourceText: span.kind === 'highlight' ? span.noteSourceText : span.sourceText });
  };
  const body = renderLocatedArticleBody({ ...input, createExtraNote, spans });
  const unlocated = allSpans.filter((span) => !span.located)
    .map((span) => `(❄ highlight: ${span.sourceText})${createExtraNote(span)}`);
  return [body, ...unlocated].filter(Boolean).join('\n\n');
}

function renderLocatedArticleBody(input: {
  articleContent: string;
  createExtraNote: (span: LocatorMirrorSpan) => string;
  spans: LocatorMirrorSpan[];
}) {
  const { spans } = input;
  if (spans.length === 0) {
    return input.articleContent;
  }
  if (hasTouchingLocatorMirrorSpans(spans)) {
    return renderArticleBodyFromOverlappingLocators({
      articleContent: input.articleContent,
      createExtraNote: input.createExtraNote,
      spans
    });
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.from > cursor) {
      parts.push(input.articleContent.slice(cursor, span.from));
    }
    parts.push(renderMarkedSource(span.kind, span.sourceText) + input.createExtraNote(span));
    cursor = span.to;
  }
  if (cursor < input.articleContent.length) {
    parts.push(input.articleContent.slice(cursor));
  }
  return parts.join('');
}
