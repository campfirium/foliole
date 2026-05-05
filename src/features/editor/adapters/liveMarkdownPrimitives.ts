import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import { CODE_FENCE_PATTERN } from '../model/markdownLineSyntax';

const HEADING_PREFIX_PATTERN = /^\s*#{1,6}(?:\s+|$)/;
const THEMATIC_BREAK_PATTERN = /^ {0,3}(?:(?:-\s*){3,}|(?:_\s*){3,}|(?:\*\s*){3,})$/;
const QUOTE_PREFIX_PATTERN = /^(\s*(?:>\s*)+)/;
const CALLOUT_PREFIX_PATTERN = /^(\[!([A-Za-z][\w-]*)\]\s*)/;
const TASK_LIST_PREFIX_PATTERN = /^(\s*[-*+]\s+\[)([ xX])(\]\s+)/;
const UNORDERED_LIST_PREFIX_PATTERN = /^(\s*[-*+]\s+)/;
const ORDERED_LIST_PREFIX_PATTERN = /^(\s*)(\d+)([.)])(\s+)/;

type PrefixWidgetKind = 'quote' | 'unordered-list' | 'ordered-list' | 'task-list' | 'callout';

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
  showSyntax: boolean,
  options: { forceHideHeadingSyntax?: boolean } = {}
) {
  const headingPrefixMatch = text.match(HEADING_PREFIX_PATTERN);
  if (headingPrefixMatch) {
    const prefixLength = headingPrefixMatch[0].length;
    if (showSyntax && options.forceHideHeadingSyntax !== true) {
      addMark(ranges, from, from + prefixLength, 'cm-md-syntax-visible');
      return;
    }
    addMark(ranges, from, from + prefixLength, 'cm-md-heading-syntax-hidden');
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
  const calloutPrefixMatch = collectCalloutPrefixMatch(innerFrom, innerText);
  if (calloutPrefixMatch) {
    if (showSyntax) {
      addMark(ranges, calloutPrefixMatch.from, calloutPrefixMatch.to, 'cm-md-syntax-visible');
    } else {
      addPrefixWidget(ranges, calloutPrefixMatch);
    }
    return;
  }

  const widgetPrefixMatch = collectPrefixWidgetMatch(innerFrom, innerText);
  if (!widgetPrefixMatch) return;
  if (showSyntax) {
    addMark(ranges, widgetPrefixMatch.from, widgetPrefixMatch.to, 'cm-md-syntax-visible');
    return;
  }
  addPrefixWidget(ranges, widgetPrefixMatch);
}

function collectCalloutPrefixMatch(from: number, text: string): PrefixWidgetMatch | null {
  const match = text.match(CALLOUT_PREFIX_PATTERN);
  if (!match) return null;
  const prefix = match[1] ?? '';
  const kind = match[2] ?? 'note';
  return { from, to: from + prefix.length, kind: 'callout', markerText: formatCalloutLabel(kind) };
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

export function addThematicBreakDecoration(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  showSyntax: boolean
) {
  if (!THEMATIC_BREAK_PATTERN.test(text)) return;

  const lineTo = from + text.length;
  if (showSyntax) {
    addMark(ranges, from, lineTo, 'cm-md-syntax-visible');
    return;
  }
  ranges.push(
    Decoration.replace({
      inclusive: false,
      widget: new ThematicBreakWidget()
    }).range(from, lineTo)
  );
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

class ThematicBreakWidget extends WidgetType {
  eq(other: ThematicBreakWidget) {
    return other instanceof ThematicBreakWidget;
  }

  toDOM() {
    const rule = document.createElement('span');
    rule.className = 'cm-md-thematic-break';
    rule.setAttribute('aria-hidden', 'true');
    return rule;
  }
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
    if (this.kind === 'callout') {
      marker.classList.add('cm-md-callout-title');
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

function formatCalloutLabel(kind: string) {
  return `${kind.slice(0, 1).toUpperCase()}${kind.slice(1).toLowerCase()}`;
}
