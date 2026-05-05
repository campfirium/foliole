import type { Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { invoke } from '@tauri-apps/api/core';

import {
  collectAnchorTagTokenRanges,
  collectAnchorTextSegments,
  type AnchorTextSegment
} from '../model/anchorTagSegments';
import { getMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

const CODE_FENCE_PATTERN = /^\s*`{3,}/;
const HEADING_PREFIX_PATTERN = /^\s*#{1,6}(?:\s+|$)/;
const QUOTE_PREFIX_PATTERN = /^(\s*(?:>\s*)+)/;
const UNORDERED_LIST_PREFIX_PATTERN = /^(\s*[-*+]\s+)/;
const ORDERED_LIST_PREFIX_PATTERN = /^(\s*)(\d+)([.)])(\s+)/;
const INLINE_TOKEN_PATTERN = /(\*\*|__|~~)/g;
const INLINE_STRONG_PATTERN = /(\*\*|__)(.+?)\1/g;
const INLINE_HIGHLIGHT_PATTERN = /==(.+?)==/g;
const INLINE_CLOZE_PATTERN = /\{\{(.+?)\}\}/g;
const INLINE_CLOZE_PLACEHOLDER_PATTERN = /\[\.\.\.\]/g;
const INLINE_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const INLINE_LINK_PATTERN = /(?<!!)\[([^\]\n]*)\]\(([^)\n]*)\)/g;

interface MarkdownImageMatch extends RangeBounds {
  alt: string;
  source: string;
}

interface InlineCodeMatch extends RangeBounds {
  contentFrom: number;
  contentTo: number;
}

interface InlineLinkMatch extends RangeBounds {
  labelFrom: number;
  labelTo: number;
  hiddenRanges: RangeBounds[];
  href: string;
}

type PrefixWidgetKind = 'quote' | 'unordered-list' | 'ordered-list';

interface PrefixWidgetMatch extends RangeBounds {
  kind: PrefixWidgetKind;
  markerText: string;
}

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
  if (/^\s*(?:>\s*)+/.test(text)) {
    return 'cm-line-quote';
  }
  if (/^\s*[-*+]\s+/.test(text)) {
    return 'cm-line-list-unordered';
  }
  if (/^\s*\d+[.)]\s+/.test(text)) {
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

function addMark(
  ranges: Range<Decoration>[],
  from: number,
  to: number,
  className: string,
  attributes?: Record<string, string>
) {
  if (to <= from) {
    return;
  }
  ranges.push(
    Decoration.mark({
      class: className,
      attributes
    }).range(from, to)
  );
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
  const headingPrefixMatch = text.match(HEADING_PREFIX_PATTERN);
  if (headingPrefixMatch) {
    const prefixLength = headingPrefixMatch[0].length;
    if (showSyntax) {
      addMark(ranges, from, from + prefixLength, 'cm-md-syntax-visible');
      return;
    }
    addReplace(ranges, from, from + prefixLength);
    return;
  }

  const quotePrefixLength = text.match(QUOTE_PREFIX_PATTERN)?.[0].length ?? 0;
  if (quotePrefixLength > 0) {
    const quoteFrom = from;
    const quoteTo = from + quotePrefixLength;
    if (showSyntax) {
      addMark(ranges, quoteFrom, quoteTo, 'cm-md-syntax-visible');
    } else {
      addReplace(ranges, quoteFrom, quoteTo);
    }
  }

  const innerFrom = from + quotePrefixLength;
  const innerText = text.slice(quotePrefixLength);
  const widgetPrefixMatch = collectPrefixWidgetMatch(innerFrom, innerText);
  if (!widgetPrefixMatch) {
    return;
  }
  if (showSyntax) {
    addMark(ranges, widgetPrefixMatch.from, widgetPrefixMatch.to, 'cm-md-syntax-visible');
    return;
  }
  addPrefixWidget(ranges, widgetPrefixMatch);
}

function addCodeFenceDecoration(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  showSyntax: boolean
) {
  const match = text.match(CODE_FENCE_PATTERN);
  if (!match) {
    return;
  }

  const lineTo = from + text.length;
  if (showSyntax) {
    addMark(ranges, from, lineTo, 'cm-md-syntax-visible');
    return;
  }
  addReplace(ranges, from, lineTo);
}

function collectPrefixWidgetMatch(from: number, text: string): PrefixWidgetMatch | null {
  const unorderedListMatch = text.match(UNORDERED_LIST_PREFIX_PATTERN);
  if (unorderedListMatch) {
    const prefix = unorderedListMatch[0] ?? '';
    return {
      from,
      to: from + prefix.length,
      kind: 'unordered-list',
      markerText: '• '
    };
  }

  const orderedListMatch = text.match(ORDERED_LIST_PREFIX_PATTERN);
  if (!orderedListMatch) {
    return null;
  }

  const indent = orderedListMatch[1] ?? '';
  const numberText = orderedListMatch[2] ?? '1';
  const delimiter = orderedListMatch[3] ?? '.';
  const trailingWhitespace = orderedListMatch[4] ?? ' ';
  const prefixLength = indent.length + numberText.length + delimiter.length + trailingWhitespace.length;
  return {
    from,
    to: from + prefixLength,
    kind: 'ordered-list',
    markerText: `${numberText}${delimiter} `
  };
}

class PrefixWidget extends WidgetType {
  readonly kind: PrefixWidgetKind;
  readonly markerText: string;

  constructor(kind: PrefixWidgetKind, markerText: string) {
    super();
    this.kind = kind;
    this.markerText = markerText;
  }

  eq(other: PrefixWidget) {
    return this.kind === other.kind && this.markerText === other.markerText;
  }

  toDOM() {
    const marker = document.createElement('span');
    marker.className = `cm-md-prefix-widget cm-md-prefix-${this.kind}`;
    marker.textContent = this.markerText;
    return marker;
  }
}

function addPrefixWidget(ranges: Range<Decoration>[], match: PrefixWidgetMatch) {
  ranges.push(
    Decoration.replace({
      widget: new PrefixWidget(match.kind, match.markerText),
      inclusive: false
    }).range(match.from, match.to)
  );
}

class MarkdownImageWidget extends WidgetType {
  readonly alt: string;
  readonly source: string;

  constructor(alt: string, source: string) {
    super();
    this.alt = alt;
    this.source = source;
  }

  eq(other: MarkdownImageWidget) {
    return this.alt === other.alt && this.source === other.source;
  }

  toDOM() {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-md-image-widget';

    const image = document.createElement('img');
    image.alt = this.alt || 'Markdown image';
    image.src = this.source;
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.decoding = 'async';
    image.className = 'cm-md-image-element';

    wrapper.append(image);
    return wrapper;
  }
}

function isSafeImageSource(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function collectImageMatches(from: number, text: string): MarkdownImageMatch[] {
  const matches: MarkdownImageMatch[] = [];
  let match = INLINE_IMAGE_PATTERN.exec(text);
  while (match) {
    const source = match[2] ?? '';
    if (isSafeImageSource(source)) {
      const start = from + match.index;
      matches.push({
        from: start,
        to: start + match[0].length,
        alt: match[1] ?? '',
        source
      });
    }
    match = INLINE_IMAGE_PATTERN.exec(text);
  }
  INLINE_IMAGE_PATTERN.lastIndex = 0;
  return matches;
}

function addImageDecorations(ranges: Range<Decoration>[], imageMatches: ReadonlyArray<MarkdownImageMatch>) {
  for (const imageMatch of imageMatches) {
    ranges.push(
      Decoration.replace({
        widget: new MarkdownImageWidget(imageMatch.alt, imageMatch.source),
        inclusive: false
      }).range(imageMatch.from, imageMatch.to)
    );
  }
}

function collectInlineCodeMatches(from: number, text: string): InlineCodeMatch[] {
  const matches: InlineCodeMatch[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] !== '`') {
      index += 1;
      continue;
    }

    const openerStart = index;
    while (index < text.length && text[index] === '`') {
      index += 1;
    }
    const delimiterLength = index - openerStart;
    const openerEnd = index;

    let cursor = openerEnd;
    let foundClosing = false;
    while (cursor < text.length) {
      if (text[cursor] !== '`') {
        cursor += 1;
        continue;
      }

      const closerStart = cursor;
      while (cursor < text.length && text[cursor] === '`') {
        cursor += 1;
      }
      const closerLength = cursor - closerStart;
      if (closerLength !== delimiterLength) {
        continue;
      }

      matches.push({
        from: from + openerStart,
        to: from + cursor,
        contentFrom: from + openerEnd,
        contentTo: from + closerStart
      });
      foundClosing = true;
      break;
    }

    if (!foundClosing) {
      index = openerEnd;
    }
  }

  return matches;
}

function addInlineCodeDecorations(
  ranges: Range<Decoration>[],
  codeMatches: ReadonlyArray<InlineCodeMatch>,
  showSyntax: boolean
) {
  for (const codeMatch of codeMatches) {
    addMark(ranges, codeMatch.contentFrom, codeMatch.contentTo, 'cm-md-inline-code');
    if (showSyntax) {
      addMark(ranges, codeMatch.from, codeMatch.contentFrom, 'cm-md-syntax-visible');
      addMark(ranges, codeMatch.contentTo, codeMatch.to, 'cm-md-syntax-visible');
      continue;
    }
    addReplace(ranges, codeMatch.from, codeMatch.contentFrom);
    addReplace(ranges, codeMatch.contentTo, codeMatch.to);
  }
}

function collectInlineLinkMatches(
  from: number,
  text: string,
  preservedRanges: ReadonlyArray<RangeBounds>
): InlineLinkMatch[] {
  const matches: InlineLinkMatch[] = [];

  let match = INLINE_LINK_PATTERN.exec(text);
  while (match) {
    const start = from + match.index;
    const fullText = match[0] ?? '';
    const label = match[1] ?? '';
    const labelFrom = start + 1;
    const labelTo = labelFrom + label.length;
    const pairFrom = labelTo;
    const pairTo = pairFrom + 2;
    const linkTo = start + fullText.length;

    if (!isWithinRanges(start, linkTo, preservedRanges)) {
      const urlFrom = pairTo;
      const urlTo = linkTo - 1;
      matches.push({
        from: start,
        to: linkTo,
        labelFrom,
        labelTo,
        hiddenRanges: [
          { from: start, to: start + 1 },
          { from: pairFrom, to: pairTo },
          { from: urlFrom, to: urlTo },
          { from: linkTo - 1, to: linkTo }
        ],
        href: match[2] ?? ''
      });
    }
    match = INLINE_LINK_PATTERN.exec(text);
  }
  INLINE_LINK_PATTERN.lastIndex = 0;

  return matches;
}

function addInlineLinkDecorations(
  ranges: Range<Decoration>[],
  linkMatches: ReadonlyArray<InlineLinkMatch>,
  showSyntax: boolean
) {
  for (const linkMatch of linkMatches) {
    addMark(ranges, linkMatch.labelFrom, linkMatch.labelTo, 'cm-md-link-text', {
      'data-md-link-url': linkMatch.href
    });

    for (const hiddenRange of linkMatch.hiddenRanges) {
      if (showSyntax) {
        addMark(ranges, hiddenRange.from, hiddenRange.to, 'cm-md-syntax-visible');
      } else {
        addReplace(ranges, hiddenRange.from, hiddenRange.to);
      }
    }
  }
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

function rangeOverlaps(leftFrom: number, leftTo: number, rightFrom: number, rightTo: number) {
  return leftFrom < rightTo && leftTo > rightFrom;
}

function collectSelectionTextWithExpandedLinks(view: EditorView) {
  const { state } = view;
  const selectionRanges = state.selection.ranges;
  const pieces: string[] = [];
  let expanded = false;

  for (const range of selectionRanges) {
    if (range.empty) {
      continue;
    }

    let from = range.from;
    let to = range.to;
    const startLine = state.doc.lineAt(from).number;
    const endLine = state.doc.lineAt(Math.max(from, to - 1)).number;

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      const linkMatches = collectInlineLinkMatches(line.from, line.text, []);
      for (const linkMatch of linkMatches) {
        if (!rangeOverlaps(from, to, linkMatch.labelFrom, linkMatch.labelTo)) {
          continue;
        }
        from = Math.min(from, linkMatch.from);
        to = Math.max(to, linkMatch.to);
        expanded = true;
      }
    }

    pieces.push(state.doc.sliceString(from, to));
  }

  if (pieces.length === 0 || !expanded) {
    return null;
  }
  return pieces.join('\n');
}

async function openMarkdownLink(href: string) {
  if (typeof window === 'undefined') {
    return;
  }
  const trimmed = href.trim();
  if (!trimmed) {
    return;
  }

  const resolvedHref = (() => {
    try {
      return new URL(trimmed, window.location.href).toString();
    } catch {
      return null;
    }
  })();

  if (!resolvedHref) {
    return;
  }

  try {
    await invoke('open_external_url', { url: resolvedHref });
    return;
  } catch {
    // Fall back to browser behavior in non-Tauri environments.
  }

  window.open(resolvedHref, '_blank', 'noopener,noreferrer');
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
    const isCodeFenceLine = CODE_FENCE_PATTERN.test(line.text);
    const lineClass = createLineClass(line.text, inCodeBlock);
    const isCursorLine = cursorLineNumber !== null && lineNumber === cursorLineNumber;
    const showSyntaxOnLine = showMarkdownSyntax && isCursorLine;
    const clozePlaceholderRanges = collectClozePlaceholderRanges(line.from, line.text);
    const imageMatches = collectImageMatches(line.from, line.text);
    const inlineCodeMatches = inCodeBlock ? [] : collectInlineCodeMatches(line.from, line.text);
    const imageRanges = imageMatches.map((imageMatch) => ({ from: imageMatch.from, to: imageMatch.to }));
    const inlineCodeRanges = inlineCodeMatches.map((match) => ({ from: match.from, to: match.to }));
    const preservedRanges = clozePlaceholderRanges.concat(imageRanges, inlineCodeRanges);
    const inlineLinkMatches = inCodeBlock ? [] : collectInlineLinkMatches(line.from, line.text, preservedRanges);

    if (lineClass) {
      if (isCodeFenceLine && !showSyntaxOnLine) {
        addLine(ranges, line.from, 'cm-line-code-fence-hidden');
      } else {
        addLine(ranges, line.from, lineClass);
      }
    }

    if (!showSyntaxOnLine && !isCursorLine && !inCodeBlock) {
      addImageDecorations(ranges, imageMatches);
    }

    addPrefixDecoration(ranges, line.from, line.text, showSyntaxOnLine);
    addCodeFenceDecoration(ranges, line.from, line.text, showSyntaxOnLine);
    addInlineCodeDecorations(ranges, inlineCodeMatches, showSyntaxOnLine);
    addInlineLinkDecorations(ranges, inlineLinkMatches, showSyntaxOnLine);
    addInlineTokenDecorations(ranges, line.from, line.text, inCodeBlock, showSyntaxOnLine, preservedRanges);
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

const markdownInteractionHandlers = EditorView.domEventHandlers({
  click(event) {
    const target = event.target;
    if (!(target instanceof Node)) {
      return false;
    }

    const element = target instanceof HTMLElement ? target : target.parentElement;
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const linkElement = element.closest('[data-md-link-url]');
    if (!(linkElement instanceof HTMLElement)) {
      return false;
    }

    const href = linkElement.dataset.mdLinkUrl;
    if (!href) {
      return false;
    }

    event.preventDefault();
    void openMarkdownLink(href);
    return true;
  },
  copy(event, view) {
    const clipboard = event.clipboardData;
    if (!clipboard) {
      return false;
    }

    const expandedText = collectSelectionTextWithExpandedLinks(view);
    if (!expandedText) {
      return false;
    }

    event.preventDefault();
    clipboard.setData('text/plain', expandedText);
    return true;
  }
});

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
  '.cm-line.cm-line-list, .cm-line.cm-line-list-unordered': {
    paddingLeft: '0.2rem'
  },
  '.cm-line.cm-line-quote': {
    borderLeft: '2px solid var(--app-accent-color)',
    color: 'var(--color-text-primary)',
    paddingBottom: '0.15rem',
    paddingTop: '0.15rem',
    paddingLeft: '0.75rem'
  },
  '.cm-line.cm-line-code, .cm-line.cm-line-code-fence': {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    borderRadius: 0,
    fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))',
    fontSize: 'var(--content-panel-code-font-size, 0.86rem)',
    padding: '0 0.5rem'
  },
  '.cm-line.cm-line-code-fence-hidden': {
    backgroundColor: 'transparent',
    borderRadius: 0,
    border: 0,
    fontSize: '0',
    lineHeight: '0',
    margin: 0,
    minHeight: 0,
    overflow: 'hidden',
    padding: '0 !important'
  },
  '.cm-md-syntax-visible': {
    color: 'var(--color-text-secondary)',
    opacity: '0.58'
  },
  '.cm-md-strong': {
    fontWeight: '700'
  },
  '.cm-md-inline-code': {
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: '0.25rem',
    fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))',
    fontSize: 'var(--content-panel-code-font-size, 0.86rem)',
    padding: '0 0.15rem'
  },
  '.cm-md-link-text': {
    color: 'var(--app-accent-color)',
    cursor: 'pointer',
    textDecoration: 'underline'
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
  '.cm-md-prefix-widget': {
    color: 'var(--color-text-secondary)',
    display: 'inline-block',
    whiteSpace: 'pre'
  },
  '.cm-md-prefix-unordered-list, .cm-md-prefix-ordered-list': {
    color: '#a0a5ad',
    fontWeight: '500',
    opacity: '0.95'
  },
  '.cm-md-image-widget': {
    display: 'block',
    marginBottom: '0.24rem',
    marginTop: '0.24rem',
    maxWidth: '100%'
  },
  '.cm-md-image-element': {
    border: '1px solid color-mix(in srgb, var(--color-border-strong) 36%, transparent)',
    borderRadius: '0.45rem',
    display: 'block',
    height: 'auto',
    maxWidth: '100%',
    width: 'auto',
    objectFit: 'contain'
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(var(--app-accent-color-rgb), 0.26)'
  }
});

export const liveMarkdown = [liveMarkdownTheme, markdownLinePlugin, markdownInteractionHandlers];
