import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import type { MarkdownPrefixRange } from '../model/markdownBlockProjection';
import type { MarkdownCalloutPrefixRange } from '../model/markdownOblikeBlockProjection';

import { addMark, addReplace } from './liveMarkdownPrimitives';

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
  options: {
    calloutPrefixRange?: MarkdownCalloutPrefixRange;
    forceHideHeadingSyntax?: boolean;
    prefixRanges?: readonly MarkdownPrefixRange[];
  } = {}
) {
  addParserPrefixDecoration(ranges, from, text, showSyntax, options);
}

function addParserPrefixDecoration(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  showSyntax: boolean,
  options: {
    calloutPrefixRange?: MarkdownCalloutPrefixRange;
    forceHideHeadingSyntax?: boolean;
    prefixRanges?: readonly MarkdownPrefixRange[];
  }
) {
  const prefixRanges = options.prefixRanges ?? [];
  const heading = prefixRanges.find((range) => range.kind === 'heading');
  if (heading) {
    const className = showSyntax && options.forceHideHeadingSyntax !== true ? 'cm-md-syntax-visible' : 'cm-md-heading-syntax-hidden';
    if (heading.hiddenRanges?.length) {
      for (const range of heading.hiddenRanges) addMark(ranges, range.from, range.to, className);
    } else {
      addMark(ranges, heading.from, heading.to, className);
    }
    return;
  }

  const quoteRanges = prefixRanges.filter((range) => range.kind === 'quote');
  for (const quoteRange of quoteRanges) {
    if (showSyntax) addMark(ranges, quoteRange.from, quoteRange.to, 'cm-md-syntax-visible');
    else addReplace(ranges, quoteRange.from, quoteRange.to);
  }
  if (options.calloutPrefixRange) {
    addPrefixMatch(ranges, {
      from: options.calloutPrefixRange.from,
      kind: 'callout',
      markerText: options.calloutPrefixRange.markerText,
      to: options.calloutPrefixRange.to
    }, showSyntax);
    return;
  }

  const widgetRange = prefixRanges.find(isWidgetPrefixRange);
  if (!widgetRange) return;
  addPrefixMatch(ranges, {
    checked: widgetRange.checked,
    from: widgetRange.from,
    kind: widgetRange.kind,
    markerText: widgetRange.markerText,
    to: widgetRange.to
  }, showSyntax);
}

function isWidgetPrefixRange(range: MarkdownPrefixRange): range is MarkdownPrefixRange & { kind: PrefixWidgetKind } {
  return range.kind === 'unordered-list' || range.kind === 'ordered-list' || range.kind === 'task-list';
}

function addPrefixMatch(ranges: Range<Decoration>[], match: PrefixWidgetMatch, showSyntax: boolean) {
  if (showSyntax) {
    addMark(ranges, match.from, match.to, 'cm-md-syntax-visible');
    return;
  }
  addPrefixWidget(ranges, match);
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
