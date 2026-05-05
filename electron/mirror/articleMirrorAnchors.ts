import { renderMarkedSource } from './articleMirrorMarkup.js';

interface MirrorNode {
  anchorLink: {
    id: string;
    kind: 'highlight' | 'cloze';
    locator?: {
      from?: number;
      originalText?: string;
      to?: number;
    };
  } | null;
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

export function collectLocatorMirrorSpans(
  articleContent: string,
  derivedByAnchorKey: Map<string, MirrorNode[]>
) {
  const spans = [...derivedByAnchorKey.entries()]
    .map(([key, linkedChildren]) => {
      const [kind, anchorId] = key.split(':') as ['highlight' | 'cloze', string];
      const locator = linkedChildren.find(
        (child) =>
          child.anchorLink?.locator &&
          typeof child.anchorLink.locator.from === 'number' &&
          typeof child.anchorLink.locator.to === 'number'
      )?.anchorLink?.locator;
      if (!locator) {
        return null;
      }
      const from = locator.from ?? -1;
      const to = locator.to ?? -1;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > articleContent.length) {
        return null;
      }
      const sourceText = articleContent.slice(from, to);
      return {
        anchorId,
        from,
        kind,
        sourceText: sourceText || locator.originalText || '',
        to
      } satisfies LocatorMirrorSpan;
    })
    .filter(isLocatorMirrorSpan)
    .sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));

  const filtered: LocatorMirrorSpan[] = [];
  let cursor = -1;
  for (const span of spans) {
    if (span.from < cursor) {
      continue;
    }
    filtered.push(span);
    cursor = span.to;
  }
  return filtered;
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
