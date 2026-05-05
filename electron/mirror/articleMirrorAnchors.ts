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
  if (typeof locator.from === 'number' && typeof locator.to === 'number') {
    return {
      from: locator.from,
      originalText: 'originalText' in locator ? locator.originalText : undefined,
      to: locator.to
    };
  }
  return null;
}

export function collectLocatorMirrorSpans(
  articleContent: string,
  derivedByAnchorKey: Map<string, MirrorNode[]>
) {
  return [...derivedByAnchorKey.entries()]
    .map(([key, linkedChildren]) => {
      const [kind, anchorId] = key.split(':') as ['highlight' | 'cloze', string];
      const locator = linkedChildren.find(
        (child) => resolveTextMirrorLocator(child.anchorLink?.locator) !== null
      )?.anchorLink?.locator;
      const textLocator = resolveTextMirrorLocator(locator);
      if (!textLocator) {
        return null;
      }
      const from = textLocator.from ?? -1;
      const to = textLocator.to ?? -1;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > articleContent.length) {
        return null;
      }
      const sourceText = articleContent.slice(from, to);
      return {
        anchorId,
        from,
        kind,
        sourceText: sourceText || textLocator.originalText || '',
        to
      } satisfies LocatorMirrorSpan;
    })
    .filter(isLocatorMirrorSpan)
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
  const spans = collectLocatorMirrorSpans(input.articleContent, input.derivedByAnchorKey);
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
