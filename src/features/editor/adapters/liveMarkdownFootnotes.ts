import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import type { RangeBounds } from './liveMarkdownInlineDecorations';

const FOOTNOTE_PATTERN = /\^\[(?<label>[^\]\n]+)\](?:\{(?<note>(?:\\.|[^}\n])*)\})?/g;

export interface FootnoteMatch extends RangeBounds {
  label: string;
  note: string | null;
}

class MarkdownFootnoteWidget extends WidgetType {
  readonly footnote: FootnoteMatch;

  constructor(footnote: FootnoteMatch) {
    super();
    this.footnote = footnote;
  }

  eq(other: MarkdownFootnoteWidget) {
    return this.footnote.from === other.footnote.from && this.footnote.label === other.footnote.label && this.footnote.note === other.footnote.note;
  }

  toDOM() {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-md-footnote-widget';
    wrapper.dataset.mdFootnoteLabel = this.footnote.label;
    wrapper.dataset.mdFootnoteStatus = this.footnote.note ? 'resolved' : 'unresolved';

    const marker = document.createElement('span');
    marker.className = 'cm-md-footnote-marker';
    marker.tabIndex = 0;
    marker.textContent = this.footnote.label;
    marker.setAttribute('aria-label', this.footnote.note ? `Footnote ${this.footnote.label}: ${this.footnote.note}` : `Footnote ${this.footnote.label}`);
    if (this.footnote.note) {
      marker.title = this.footnote.note;
    }
    wrapper.append(marker);

    if (!this.footnote.note) {
      return wrapper;
    }

    const tooltip = document.createElement('span');
    tooltip.className = 'cm-md-footnote-tooltip';
    tooltip.hidden = true;
    tooltip.role = 'tooltip';
    tooltip.textContent = this.footnote.note;
    wrapper.append(tooltip);

    const setOpen = (open: boolean) => {
      wrapper.dataset.mdFootnoteOpen = open ? 'true' : 'false';
      tooltip.hidden = !open;
    };

    marker.addEventListener('mouseenter', () => setOpen(true));
    marker.addEventListener('mouseleave', () => setOpen(false));
    marker.addEventListener('focus', () => setOpen(true));
    marker.addEventListener('blur', () => setOpen(false));

    return wrapper;
  }
}

export function collectFootnoteMatches(from: number, text: string, preservedRanges: ReadonlyArray<RangeBounds>): FootnoteMatch[] {
  const matches: FootnoteMatch[] = [];
  let match = FOOTNOTE_PATTERN.exec(text);

  while (match) {
    const start = from + match.index;
    const fullText = match[0] ?? '';
    const end = start + fullText.length;
    if (!rangeOverlaps(start, end, preservedRanges)) {
      matches.push({
        from: start,
        label: (match.groups?.label ?? '').trim(),
        note: unescapeFootnoteText(match.groups?.note ?? null),
        to: end
      });
    }
    match = FOOTNOTE_PATTERN.exec(text);
  }

  FOOTNOTE_PATTERN.lastIndex = 0;
  return matches;
}

export function addFootnoteDecorations(ranges: Range<Decoration>[], footnotes: ReadonlyArray<FootnoteMatch>) {
  for (const footnote of footnotes) {
    ranges.push(Decoration.replace({ widget: new MarkdownFootnoteWidget(footnote), inclusive: false }).range(footnote.from, footnote.to));
  }
}

function rangeOverlaps(from: number, to: number, ranges: ReadonlyArray<RangeBounds>) {
  for (const range of ranges) {
    if (from < range.to && to > range.from) {
      return true;
    }
  }
  return false;
}

function unescapeFootnoteText(note: string | null) {
  if (!note) {
    return null;
  }
  return note.replace(/\\([\\}])/g, '$1').trim() || null;
}

