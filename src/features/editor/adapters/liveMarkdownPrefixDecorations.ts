import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import type { MarkdownPrefixRange } from '../model/markdownBlockProjection';

import { addMark, addReplace } from './liveMarkdownPrimitives';

const CALLOUT_PREFIX_PATTERN = /^(\[!([A-Za-z][\w-]*)\]\s*)/;

type PrefixWidgetKind = 'unordered-list' | 'ordered-list' | 'task-list' | 'callout';

interface PrefixWidgetMatch {
  checked?: boolean;
  from: number;
  kind: PrefixWidgetKind;
  markerText: string;
  to: number;
}

export function addPrefixDecoration(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  showSyntax: boolean,
  options: { forceHideHeadingSyntax?: boolean; prefixRanges?: readonly MarkdownPrefixRange[] } = {}
) {
  if (addParserPrefixDecoration(ranges, from, text, showSyntax, options)) return;
  addCalloutPrefixDecoration(ranges, from, text, showSyntax);
}

function addParserPrefixDecoration(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  showSyntax: boolean,
  options: { forceHideHeadingSyntax?: boolean; prefixRanges?: readonly MarkdownPrefixRange[] }
) {
  const prefixRanges = options.prefixRanges ?? [];
  if (prefixRanges.length === 0) return false;
  const heading = prefixRanges.find((range) => range.kind === 'heading');
  if (heading) {
    addMark(ranges, heading.from, heading.to, showSyntax && options.forceHideHeadingSyntax !== true ? 'cm-md-syntax-visible' : 'cm-md-heading-syntax-hidden');
    return true;
  }

  const quoteRanges = prefixRanges.filter((range) => range.kind === 'quote');
  for (const quoteRange of quoteRanges) {
    if (showSyntax) addMark(ranges, quoteRange.from, quoteRange.to, 'cm-md-syntax-visible');
    else addReplace(ranges, quoteRange.from, quoteRange.to);
  }
  const innerFrom = quoteRanges.reduce((max, range) => Math.max(max, range.to), from);
  const calloutMatch = collectCalloutPrefixMatch(innerFrom, text.slice(innerFrom - from));
  if (calloutMatch) {
    addPrefixMatch(ranges, calloutMatch, showSyntax);
    return true;
  }

  const widgetRange = prefixRanges.find(isWidgetPrefixRange);
  if (!widgetRange) return quoteRanges.length > 0;
  addPrefixMatch(ranges, {
    checked: widgetRange.checked,
    from: widgetRange.from,
    kind: widgetRange.kind,
    markerText: widgetRange.markerText,
    to: widgetRange.to
  }, showSyntax);
  return true;
}

function isWidgetPrefixRange(range: MarkdownPrefixRange): range is MarkdownPrefixRange & { kind: PrefixWidgetKind } {
  return range.kind === 'unordered-list' || range.kind === 'ordered-list' || range.kind === 'task-list';
}

function addCalloutPrefixDecoration(ranges: Range<Decoration>[], from: number, text: string, showSyntax: boolean) {
  const calloutMatch = collectCalloutPrefixMatch(from, text);
  if (calloutMatch) addPrefixMatch(ranges, calloutMatch, showSyntax);
}

function addPrefixMatch(ranges: Range<Decoration>[], match: PrefixWidgetMatch, showSyntax: boolean) {
  if (showSyntax) {
    addMark(ranges, match.from, match.to, 'cm-md-syntax-visible');
    return;
  }
  addPrefixWidget(ranges, match);
}

function collectCalloutPrefixMatch(from: number, text: string): PrefixWidgetMatch | null {
  const match = text.match(CALLOUT_PREFIX_PATTERN);
  if (!match) return null;
  const prefix = match[1] ?? '';
  const kind = match[2] ?? 'note';
  return { from, to: from + prefix.length, kind: 'callout', markerText: formatCalloutLabel(kind) };
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
    if (this.kind === 'callout') marker.classList.add('cm-md-callout-title');
    marker.textContent = this.markerText;
    return marker;
  }
}

function addPrefixWidget(ranges: Range<Decoration>[], match: PrefixWidgetMatch) {
  ranges.push(Decoration.replace({ widget: new PrefixWidget(match.kind, match.markerText, match.checked), inclusive: false }).range(match.from, match.to));
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
