import type { Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import {
  collectAnchorTagTokenRanges,
  collectAnchorTextSegments,
  type AnchorTextSegment
} from '../model/anchorTagSegments';
import { getMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

const CODE_FENCE_PATTERN = /^\s*`{3,}/;
const PREFIX_PATTERN = /^\s*(#{1,6}\s*|[-*+]\s+|\d+\.\s+|>\s?)/;
const INLINE_TOKEN_PATTERN = /(\*\*|__|~~|`+|!\[|\[|\]\(|\]|\(|\))/g;
const INLINE_STRONG_PATTERN = /(\*\*|__)(.+?)\1/g;
const INLINE_HIGHLIGHT_PATTERN = /==(.+?)==/g;
const INLINE_CLOZE_PATTERN = /\{\{(.+?)\}\}/g;
const INLINE_CLOZE_PLACEHOLDER_PATTERN = /\[\.\.\.\]/g;

function createLineClass(text: string, inCodeBlock: boolean) {
  if (CODE_FENCE_PATTERN.test(text)) {
    return 'cm-line-code-fence';
  }
  if (inCodeBlock) {
    return 'cm-line-code';
  }
  if (/^#{3}\s*/.test(text)) {
    return 'cm-line-h3';
  }
  if (/^#{2}\s*/.test(text)) {
    return 'cm-line-h2';
  }
  if (/^#{1}\s*/.test(text)) {
    return 'cm-line-h1';
  }
  if (/^\s*>\s?/.test(text)) {
    return 'cm-line-quote';
  }
  if (/^\s*([-*+]\s+|\d+\.\s+)/.test(text)) {
    return 'cm-line-list';
  }
  return null;
}

function addReplace(ranges: Range<Decoration>[], from: number, to: number) {
  if (to <= from) {
    return;
  }
  ranges.push(Decoration.replace({}).range(from, to));
}

function addMark(ranges: Range<Decoration>[], from: number, to: number, className: string) {
  if (to <= from) {
    return;
  }
  ranges.push(Decoration.mark({ class: className }).range(from, to));
}

function addLine(ranges: Range<Decoration>[], from: number, className: string) {
  ranges.push(
    Decoration.line({
      attributes: {
        class: className
      }
    }).range(from)
  );
}

function addPrefixDecoration(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  showSyntax: boolean
) {
  const prefixMatch = text.match(PREFIX_PATTERN);
  if (!prefixMatch) {
    return;
  }

  const prefixLength = prefixMatch[0].length;
  if (showSyntax) {
    addMark(ranges, from, from + prefixLength, 'cm-md-syntax-visible');
    return;
  }
  addReplace(ranges, from, from + prefixLength);
}

function addInlineTokenDecorations(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  inCodeBlock: boolean,
  showSyntax: boolean,
  preservedRanges: ReadonlyArray<RangeBounds>
) {
  if (inCodeBlock) {
    return;
  }

  let tokenMatch = INLINE_TOKEN_PATTERN.exec(text);

  while (tokenMatch) {
    const tokenFrom = from + tokenMatch.index;
    const tokenTo = tokenFrom + tokenMatch[0].length;
    if (isWithinRanges(tokenFrom, tokenTo, preservedRanges)) {
      tokenMatch = INLINE_TOKEN_PATTERN.exec(text);
      continue;
    }
    if (showSyntax) {
      addMark(ranges, tokenFrom, tokenTo, 'cm-md-syntax-visible');
    } else {
      addReplace(ranges, tokenFrom, tokenTo);
    }
    tokenMatch = INLINE_TOKEN_PATTERN.exec(text);
  }

  INLINE_TOKEN_PATTERN.lastIndex = 0;
}

interface RangeBounds {
  from: number;
  to: number;
}

function collectClozePlaceholderRanges(from: number, text: string): RangeBounds[] {
  const ranges: RangeBounds[] = [];
  let match = INLINE_CLOZE_PLACEHOLDER_PATTERN.exec(text);
  while (match) {
    const start = from + match.index;
    ranges.push({ from: start, to: start + match[0].length });
    match = INLINE_CLOZE_PLACEHOLDER_PATTERN.exec(text);
  }
  INLINE_CLOZE_PLACEHOLDER_PATTERN.lastIndex = 0;
  return ranges;
}

function isWithinRanges(from: number, to: number, ranges: ReadonlyArray<RangeBounds>) {
  for (const range of ranges) {
    if (from < range.to && to > range.from) {
      return true;
    }
  }
  return false;
}

function addClozePlaceholderDecorations(ranges: Range<Decoration>[], placeholderRanges: ReadonlyArray<RangeBounds>) {
  for (const range of placeholderRanges) {
    addMark(ranges, range.from, range.to, 'cm-md-cloze-placeholder');
  }
}

function addStrongTextDecorations(ranges: Range<Decoration>[], from: number, text: string, inCodeBlock: boolean) {
  if (inCodeBlock) {
    return;
  }

  let match = INLINE_STRONG_PATTERN.exec(text);
  while (match) {
    const delimiterLength = match[1]?.length ?? 0;
    const contentFrom = from + match.index + delimiterLength;
    const contentTo = from + match.index + match[0].length - delimiterLength;
    addMark(ranges, contentFrom, contentTo, 'cm-md-strong');
    match = INLINE_STRONG_PATTERN.exec(text);
  }
  INLINE_STRONG_PATTERN.lastIndex = 0;
}

function addSemanticMarkDecorations(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  inCodeBlock: boolean
) {
  if (inCodeBlock) {
    return;
  }

  let highlightMatch = INLINE_HIGHLIGHT_PATTERN.exec(text);
  while (highlightMatch) {
    const start = from + highlightMatch.index;
    const matchText = highlightMatch[0];
    const contentFrom = start + 2;
    const contentTo = start + matchText.length - 2;
    addMark(ranges, contentFrom, contentTo, 'cm-md-highlight');
    addReplace(ranges, start, start + 2);
    addReplace(ranges, contentTo, contentTo + 2);
    highlightMatch = INLINE_HIGHLIGHT_PATTERN.exec(text);
  }
  INLINE_HIGHLIGHT_PATTERN.lastIndex = 0;

  let clozeMatch = INLINE_CLOZE_PATTERN.exec(text);
  while (clozeMatch) {
    const start = from + clozeMatch.index;
    const matchText = clozeMatch[0];
    const contentFrom = start + 2;
    const contentTo = start + matchText.length - 2;
    addMark(ranges, contentFrom, contentTo, 'cm-md-cloze');
    addReplace(ranges, start, start + 2);
    addReplace(ranges, contentTo, contentTo + 2);
    clozeMatch = INLINE_CLOZE_PATTERN.exec(text);
  }
  INLINE_CLOZE_PATTERN.lastIndex = 0;
}

function addAnchorTagDecorations(ranges: Range<Decoration>[], content: string) {
  const segments = collectAnchorTextSegments(content);
  const tokenRanges = mergeAdjacentRanges(collectAnchorTagTokenRanges(content));

  for (const tokenRange of tokenRanges) {
    addReplace(ranges, tokenRange.from, tokenRange.to);
  }

  const highlightBaseRanges = collectMergedSegmentRanges(content, segments, (segment) => segment.activeHighlightCount > 0);
  const clozeRanges = collectMergedSegmentRanges(content, segments, (segment) => segment.activeClozeCount > 0);
  const highlightOverlapRanges = collectMergedSegmentRanges(
    content,
    segments,
    (segment) => segment.activeHighlightCount > 1
  );
  const mixedOverlapRanges = collectMergedSegmentRanges(
    content,
    segments,
    (segment) => segment.activeHighlightCount + segment.activeClozeCount > 1 && segment.activeHighlightCount <= 1
  );

  for (const range of highlightBaseRanges) {
    addMark(ranges, range.from, range.to, 'cm-md-highlight');
  }
  for (const range of clozeRanges) {
    addMark(ranges, range.from, range.to, 'cm-md-cloze');
  }
  for (const range of highlightOverlapRanges) {
    addMark(ranges, range.from, range.to, 'cm-md-highlight-overlap');
  }
  for (const range of mixedOverlapRanges) {
    addMark(ranges, range.from, range.to, 'cm-md-anchor-overlap');
  }
}

function mergeAdjacentRanges(ranges: Array<{ from: number; to: number }>) {
  if (ranges.length === 0) {
    return ranges;
  }

  const merged: Array<{ from: number; to: number }> = [];
  let current = { ...ranges[0] };

  for (let index = 1; index < ranges.length; index += 1) {
    const next = ranges[index];
    if (next.from <= current.to) {
      current.to = Math.max(current.to, next.to);
      continue;
    }
    merged.push(current);
    current = { ...next };
  }

  merged.push(current);
  return merged;
}

function collectMergedSegmentRanges(
  content: string,
  segments: ReadonlyArray<AnchorTextSegment>,
  predicate: (segment: Readonly<AnchorTextSegment>) => boolean
) {
  const picked: Array<{ from: number; to: number }> = [];
  for (const segment of segments) {
    if (!predicate(segment)) {
      continue;
    }
    picked.push({ from: segment.from, to: segment.to });
  }
  return mergeRangesAcrossAnchorTagGaps(content, picked);
}

function mergeRangesAcrossAnchorTagGaps(content: string, ranges: Array<{ from: number; to: number }>) {
  if (ranges.length === 0) {
    return ranges;
  }

  const merged: Array<{ from: number; to: number }> = [];
  let current = { ...ranges[0] };

  for (let index = 1; index < ranges.length; index += 1) {
    const next = ranges[index];
    const canJoinByTouching = next.from <= current.to;
    const canJoinByHiddenTags = isAnchorTagGap(content.slice(current.to, next.from));

    if (canJoinByTouching || canJoinByHiddenTags) {
      current.to = Math.max(current.to, next.to);
      continue;
    }

    merged.push(current);
    current = { ...next };
  }

  merged.push(current);
  return merged;
}

function isAnchorTagGap(value: string) {
  if (!value.trim()) {
    return true;
  }
  const stripped = value.replace(/<\/?(?:highlight|cloze)\s+id="[^"]+"\s*>/g, '').trim();
  return stripped.length === 0;
}

function getCursorLineNumber(view: EditorView) {
  if (!view.hasFocus) {
    return null;
  }
  const cursor = view.state.selection.main.head;
  return view.state.doc.lineAt(cursor).number;
}

function buildLineDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const content = view.state.doc.toString();
  addAnchorTagDecorations(ranges, content);

  const showMarkdownSyntax = getMarkdownSyntaxVisibility() === 'visible';
  const cursorLineNumber = getCursorLineNumber(view);
  let inCodeBlock = false;

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const lineClass = createLineClass(line.text, inCodeBlock);
    const isCursorLine = cursorLineNumber !== null && lineNumber === cursorLineNumber;
    const showSyntaxOnLine = showMarkdownSyntax && isCursorLine;
    const clozePlaceholderRanges = collectClozePlaceholderRanges(line.from, line.text);

    if (lineClass) {
      addLine(ranges, line.from, lineClass);
    }

    addPrefixDecoration(ranges, line.from, line.text, showSyntaxOnLine);
    addInlineTokenDecorations(ranges, line.from, line.text, inCodeBlock, showSyntaxOnLine, clozePlaceholderRanges);
    addStrongTextDecorations(ranges, line.from, line.text, inCodeBlock);
    addSemanticMarkDecorations(ranges, line.from, line.text, inCodeBlock);
    addClozePlaceholderDecorations(ranges, clozePlaceholderRanges);

    if (CODE_FENCE_PATTERN.test(line.text)) {
      inCodeBlock = !inCodeBlock;
    }
  }

  return Decoration.set(ranges, true);
}

const markdownLinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLineDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
        this.decorations = buildLineDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations
  }
);

const liveMarkdownTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    height: '100%'
  },
  '.cm-scroller': {
    color: 'var(--color-text-primary)',
    lineHeight: '1.72'
  },
  '.cm-content': {
    boxSizing: 'border-box',
    fontFamily: 'var(--content-panel-font-family, var(--font-family-sans))',
    fontSize: 'var(--content-panel-font-size, 1.0625rem)',
    margin: '0 auto',
    maxWidth: 'min(100%, var(--document-max-width, 860px))',
    padding: '0.72rem 1.5rem 0.6rem',
    width: '100%'
  },
  '.cm-widgetBuffer': {
    width: '0px'
  },
  '.cm-line': {
    padding: 0
  },
  '.cm-line.cm-line-h1': {
    fontSize: 'var(--content-panel-h1-font-size, 1.5rem)',
    fontWeight: '700',
    letterSpacing: '-0.01em',
    paddingBottom: '0.25rem',
    paddingTop: '0.75rem'
  },
  '.cm-line.cm-line-h2': {
    fontSize: 'var(--content-panel-h2-font-size, 1.25rem)',
    fontWeight: '700',
    paddingBottom: '0.2rem',
    paddingTop: '0.65rem'
  },
  '.cm-line.cm-line-h3': {
    fontSize: 'var(--content-panel-h3-font-size, 1.08rem)',
    fontWeight: '650',
    paddingTop: '0.5rem'
  },
  '.cm-line.cm-line-list': {
    paddingLeft: '1.1rem',
    position: 'relative'
  },
  '.cm-line.cm-line-list::before': {
    color: 'var(--color-text-secondary)',
    content: '"•"',
    left: '0.05rem',
    position: 'absolute'
  },
  '.cm-line.cm-line-list.cm-activeLine::before': {
    display: 'none'
  },
  '.cm-line.cm-line-quote': {
    borderLeft: '3px solid var(--color-border-strong)',
    color: 'var(--color-text-secondary)',
    paddingBottom: '0.15rem',
    paddingTop: '0.15rem',
    paddingLeft: '0.75rem'
  },
  '.cm-line.cm-line-code, .cm-line.cm-line-code-fence': {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    borderRadius: '0.35rem',
    fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))',
    fontSize: 'var(--content-panel-code-font-size, 0.86rem)',
    padding: '0.04rem 0.5rem'
  },
  '.cm-md-syntax-visible': {
    color: 'var(--color-text-secondary)',
    opacity: '0.58'
  },
  '.cm-md-strong': {
    fontWeight: '700'
  },
  '.cm-md-highlight': {
    backgroundColor: 'rgba(56, 189, 248, 0.28)',
    borderRadius: '0.25rem'
  },
  '.cm-md-cloze': {
    backgroundColor: 'rgba(250, 204, 21, 0.32)',
    borderRadius: '0.25rem'
  },
  '.cm-md-anchor-overlap': {
    backgroundColor: 'rgba(56, 189, 248, 0.32)',
    borderRadius: '0.25rem'
  },
  '.cm-md-highlight-overlap': {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderRadius: '0.25rem'
  },
  '.cm-md-cloze-placeholder': {
    backgroundColor: 'rgba(251, 113, 133, 0.24)',
    borderRadius: '0.25rem'
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(56, 189, 248, 0.26)'
  }
});

export const liveMarkdown = [liveMarkdownTheme, markdownLinePlugin];
