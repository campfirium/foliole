import type { MutableRefObject } from 'react';

export interface PdfSearchMatch {
  element: HTMLElement;
  matchStart: number;
  page: number;
}

interface TextSpanSegment {
  element: HTMLElement;
  end: number;
  start: number;
}

function collectTextSegments(shell: HTMLDivElement): TextSpanSegment[] {
  const textLayer = shell.querySelector<HTMLElement>('.textLayer');
  if (!textLayer || typeof document.createTreeWalker !== 'function') {
    return [];
  }
  const segments: TextSpanSegment[] = [];
  const textBySpan = new Map<HTMLElement, string>();
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textValue = node.textContent ?? '';
    if (textValue.length > 0) {
      const container = node.parentElement?.closest<HTMLElement>('span');
      if (container) {
        textBySpan.set(container, `${textBySpan.get(container) ?? ''}${textValue}`);
      }
    }
    node = walker.nextNode();
  }
  let cursor = 0;
  for (const [span, text] of textBySpan) {
    if (!text) {
      continue;
    }
    const start = cursor;
    const end = start + text.length;
    segments.push({ element: span, end, start });
    cursor = end;
  }
  return segments;
}

function resolveSegmentAtPosition(segments: TextSpanSegment[], position: number) {
  for (const segment of segments) {
    if (position >= segment.start && position < segment.end) {
      return segment;
    }
  }
  return segments[segments.length - 1] ?? null;
}

function collectQueryPositions(text: string, query: string) {
  if (!text || !query) {
    return [];
  }
  const positions: number[] = [];
  let index = 0;
  while (index < text.length) {
    const next = text.indexOf(query, index);
    if (next < 0) {
      break;
    }
    positions.push(next);
    index = next + 1;
  }
  return positions;
}

export function collectMatches(
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>,
  totalPages: number,
  query: string,
  pageTextByNumberRef?: MutableRefObject<Record<number, string>>
): PdfSearchMatch[] {
  const matches: PdfSearchMatch[] = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const shell = pageElementsRef.current[page];
    if (!shell) {
      continue;
    }
    const segments = collectTextSegments(shell);
    const renderedPageText = segments.map((segment) => segment.element.textContent ?? '').join('').toLocaleLowerCase();
    const indexedPageText = (pageTextByNumberRef?.current[page] ?? '').toLocaleLowerCase();
    const pageText = renderedPageText.length > 0 ? renderedPageText : indexedPageText;
    if (!pageText) {
      continue;
    }
    const positions = collectQueryPositions(pageText, query);
    for (const position of positions) {
      if (segments.length === 0) {
        matches.push({ element: shell, matchStart: position, page });
        continue;
      }
      const segment = resolveSegmentAtPosition(segments, position);
      if (segment) {
        matches.push({ element: segment.element, matchStart: position, page });
      }
    }
  }
  return matches;
}
