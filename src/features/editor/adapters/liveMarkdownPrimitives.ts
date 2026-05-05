import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

export const CODE_FENCE_PATTERN = /^\s*`{3,}/;
const HEADING_PREFIX_PATTERN = /^\s*#{1,6}(?:\s+|$)/;
const QUOTE_PREFIX_PATTERN = /^(\s*(?:>\s*)+)/;
const UNORDERED_LIST_PREFIX_PATTERN = /^(\s*[-*+]\s+)/;
const ORDERED_LIST_PREFIX_PATTERN = /^(\s*)(\d+)([.)])(\s+)/;

type PrefixWidgetKind = 'quote' | 'unordered-list' | 'ordered-list';

interface PrefixWidgetMatch {
  from: number;
  to: number;
  kind: PrefixWidgetKind;
  markerText: string;
}

export function createLineClass(text: string, inCodeBlock: boolean) {
  if (CODE_FENCE_PATTERN.test(text)) return 'cm-line-code-fence';
  if (inCodeBlock) return 'cm-line-code';
  if (/^#{3}\s*/.test(text)) return 'cm-line-h3';
  if (/^#{2}\s*/.test(text)) return 'cm-line-h2';
  if (/^#{1}\s*/.test(text)) return 'cm-line-h1';
  if (/^\s*(?:>\s*)+/.test(text)) return 'cm-line-quote';
  if (/^\s*[-*+]\s+/.test(text)) return 'cm-line-list-unordered';
  if (/^\s*\d+[.)]\s+/.test(text)) return 'cm-line-list';
  return null;
}

export function addReplace(ranges: Range<Decoration>[], from: number, to: number) {
  if (to <= from) return;
  ranges.push(Decoration.replace({}).range(from, to));
}

export function addMark(
  ranges: Range<Decoration>[],
  from: number,
  to: number,
  className: string,
  attributes?: Record<string, string>
) {
  if (to <= from) return;
  ranges.push(Decoration.mark({ class: className, attributes }).range(from, to));
}

export function addLine(ranges: Range<Decoration>[], from: number, className: string) {
  ranges.push(Decoration.line({ attributes: { class: className } }).range(from));
}

export function addPrefixDecoration(
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
    if (showSyntax) addMark(ranges, quoteFrom, quoteTo, 'cm-md-syntax-visible');
    else addReplace(ranges, quoteFrom, quoteTo);
  }

  const innerFrom = from + quotePrefixLength;
  const innerText = text.slice(quotePrefixLength);
  const widgetPrefixMatch = collectPrefixWidgetMatch(innerFrom, innerText);
  if (!widgetPrefixMatch) return;
  if (showSyntax) {
    addMark(ranges, widgetPrefixMatch.from, widgetPrefixMatch.to, 'cm-md-syntax-visible');
    return;
  }
  addPrefixWidget(ranges, widgetPrefixMatch);
}

export function addCodeFenceDecoration(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  showSyntax: boolean
) {
  const match = text.match(CODE_FENCE_PATTERN);
  if (!match) return;

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
    return { from, to: from + prefix.length, kind: 'unordered-list', markerText: '• ' };
  }

  const orderedListMatch = text.match(ORDERED_LIST_PREFIX_PATTERN);
  if (!orderedListMatch) return null;

  const indent = orderedListMatch[1] ?? '';
  const numberText = orderedListMatch[2] ?? '1';
  const delimiter = orderedListMatch[3] ?? '.';
  const trailingWhitespace = orderedListMatch[4] ?? ' ';
  const prefixLength = indent.length + numberText.length + delimiter.length + trailingWhitespace.length;
  return { from, to: from + prefixLength, kind: 'ordered-list', markerText: `${numberText}${delimiter} ` };
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
    Decoration.replace({ widget: new PrefixWidget(match.kind, match.markerText), inclusive: false }).range(
      match.from,
      match.to
    )
  );
}
