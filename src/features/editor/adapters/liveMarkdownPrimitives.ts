import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import { CODE_FENCE_PATTERN } from '../model/markdownLineSyntax';

const HEADING_PREFIX_PATTERN = /^\s*#{1,6}(?:\s+|$)/;
const QUOTE_PREFIX_PATTERN = /^(\s*(?:>\s*)+)/;
const TASK_LIST_PREFIX_PATTERN = /^(\s*[-*+]\s+\[)([ xX])(\]\s+)/;
const UNORDERED_LIST_PREFIX_PATTERN = /^(\s*[-*+]\s+)/;
const ORDERED_LIST_PREFIX_PATTERN = /^(\s*)(\d+)([.)])(\s+)/;

type PrefixWidgetKind = 'quote' | 'unordered-list' | 'ordered-list' | 'task-list';

interface PrefixWidgetMatch {
  checked?: boolean;
  from: number;
  to: number;
  kind: PrefixWidgetKind;
  markerText: string;
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
  const taskListMatch = text.match(TASK_LIST_PREFIX_PATTERN);
  if (taskListMatch) {
    const prefix = taskListMatch[0] ?? '';
    const marker = taskListMatch[2] ?? ' ';
    return { checked: marker.toLowerCase() === 'x', from, to: from + prefix.length, kind: 'task-list', markerText: '' };
  }

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
  readonly checked: boolean;
  readonly kind: PrefixWidgetKind;
  readonly markerText: string;

  constructor(kind: PrefixWidgetKind, markerText: string, checked = false) {
    super();
    this.checked = checked;
    this.kind = kind;
    this.markerText = markerText;
  }

  eq(other: PrefixWidget) {
    return this.checked === other.checked && this.kind === other.kind && this.markerText === other.markerText;
  }

  toDOM() {
    const marker = document.createElement('span');
    marker.className = `cm-md-prefix-widget cm-md-prefix-${this.kind}`;
    if (this.kind === 'task-list') {
      marker.dataset.mdTaskChecked = this.checked ? 'true' : 'false';
      marker.setAttribute('aria-hidden', 'true');
      marker.append(createTaskCheckboxElement(this.checked), document.createTextNode(' '));
      return marker;
    }
    marker.textContent = this.markerText;
    return marker;
  }
}

function addPrefixWidget(ranges: Range<Decoration>[], match: PrefixWidgetMatch) {
  ranges.push(
    Decoration.replace({ widget: new PrefixWidget(match.kind, match.markerText, match.checked), inclusive: false }).range(
      match.from,
      match.to
    )
  );
}

function createTaskCheckboxElement(checked: boolean) {
  const checkbox = document.createElement('span');
  checkbox.className = 'cm-md-task-checkbox';
  checkbox.dataset.mdTaskChecked = checked ? 'true' : 'false';
  return checkbox;
}
