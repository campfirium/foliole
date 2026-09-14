import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import type { MarkdownPrefixRange } from '../model/markdownBlockProjection';
import type { MarkdownCalloutPrefixRange } from '../model/markdownOblikeBlockProjection';

import { toggleTaskMarkerAt } from './codeMirrorListTaskCommands';
import { addMark, addReplace } from './liveMarkdownPrimitives';
import { liveMarkdownSpacing } from './liveMarkdownSpacing';

type PrefixWidgetKind = 'unordered-list' | 'ordered-list' | 'task-list' | 'callout';

interface PrefixWidgetMatch {
  checked?: boolean;
  from: number;
  kind: PrefixWidgetKind;
  listDepth?: number;
  markerText: string;
  taskMarkerFrom?: number;
  taskMarkerTo?: number;
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
    const headingContent = text.slice(heading.to - from).trim();
    const shouldShowSyntax = headingContent.length === 0 || (showSyntax && options.forceHideHeadingSyntax !== true);
    const className = shouldShowSyntax ? 'cm-md-syntax-visible' : 'cm-md-heading-syntax-hidden';
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
    ...(widgetRange.checked !== undefined ? { checked: widgetRange.checked } : {}),
    from: showSyntax || quoteRanges.length > 0 ? widgetRange.from : widgetRange.lineFrom,
    kind: widgetRange.kind,
    ...(widgetRange.listDepth !== undefined ? { listDepth: widgetRange.listDepth } : {}),
    markerText: widgetRange.markerText,
    ...(widgetRange.taskMarkerFrom !== undefined ? { taskMarkerFrom: widgetRange.taskMarkerFrom } : {}),
    ...(widgetRange.taskMarkerTo !== undefined ? { taskMarkerTo: widgetRange.taskMarkerTo } : {}),
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
  readonly listDepth: number;
  readonly markerText: string;
  readonly taskMarkerFrom: number | undefined;
  readonly taskMarkerTo: number | undefined;

  constructor(kind: PrefixWidgetKind, markerText: string, checked = false, listDepth = 0, taskMarkerFrom?: number, taskMarkerTo?: number) {
    super();
    this.checked = checked;
    this.kind = kind;
    this.listDepth = listDepth;
    this.markerText = markerText;
    this.taskMarkerFrom = taskMarkerFrom;
    this.taskMarkerTo = taskMarkerTo;
  }

  override eq(other: PrefixWidget) {
    return this.checked === other.checked && this.kind === other.kind && this.listDepth === other.listDepth && this.markerText === other.markerText
      && this.taskMarkerFrom === other.taskMarkerFrom && this.taskMarkerTo === other.taskMarkerTo;
  }

  override toDOM(view: import('@codemirror/view').EditorView) {
    const marker = document.createElement('span');
    marker.className = `cm-md-prefix-widget cm-md-prefix-${this.kind}`;
    if (this.kind !== 'callout') {
      marker.dataset.mdListDepth = String(this.listDepth);
      marker.style.marginInlineStart = liveMarkdownSpacing.listLevelInlineStart(this.listDepth);
    }
    if (this.kind === 'task-list') {
      marker.dataset.mdTaskChecked = this.checked ? 'true' : 'false';
      marker.setAttribute('aria-hidden', 'true');
      marker.append(createTaskCheckboxElement(view, this.checked, this.taskMarkerFrom, this.taskMarkerTo));
      return marker;
    }
    if (this.kind === 'callout') marker.classList.add('cm-md-callout-title');
    marker.textContent = this.markerText;
    return marker;
  }
}

function addPrefixWidget(ranges: Range<Decoration>[], match: PrefixWidgetMatch) {
  const widget = new PrefixWidget(match.kind, match.markerText, match.checked, match.listDepth, match.taskMarkerFrom, match.taskMarkerTo);
  ranges.push(Decoration.replace({ widget, inclusive: false }).range(match.from, match.to));
}

function createTaskCheckboxElement(view: import('@codemirror/view').EditorView, checked: boolean, from?: number, to?: number) {
  const checkbox = document.createElement('span');
  checkbox.className = 'cm-md-task-checkbox';
  checkbox.dataset.mdTaskChecked = checked ? 'true' : 'false';
  checkbox.addEventListener('mousedown', (event) => event.preventDefault());
  checkbox.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (from !== undefined && to !== undefined) toggleTaskMarkerAt(view, from, to);
  });
  return checkbox;
}
