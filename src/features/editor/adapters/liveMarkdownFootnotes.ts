import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import { buildFootnotePresentation } from '../model/footnotePresentation';
import type { FootnoteMatch } from '../model/inlineMarkdownMatches';
export { collectFootnoteMatches } from '../model/inlineMarkdownMatches';

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
    const presentation = buildFootnotePresentation(this.footnote);
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-md-footnote-widget';
    wrapper.dataset.mdFootnoteLabel = presentation.label;
    wrapper.dataset.mdFootnoteStatus = presentation.status;

    const marker = document.createElement('span');
    marker.className = 'cm-md-footnote-marker';
    marker.tabIndex = 0;
    marker.textContent = presentation.label;
    marker.setAttribute('aria-label', presentation.ariaLabel);
    if (presentation.note) {
      marker.title = presentation.note;
    }
    wrapper.append(marker);

    if (!presentation.hasTooltip) {
      return wrapper;
    }

    const tooltip = document.createElement('span');
    tooltip.className = 'cm-md-footnote-tooltip';
    tooltip.hidden = true;
    tooltip.role = 'tooltip';
    tooltip.textContent = presentation.note;
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

export function addFootnoteDecorations(ranges: Range<Decoration>[], footnotes: ReadonlyArray<FootnoteMatch>) {
  for (const footnote of footnotes) {
    ranges.push(Decoration.replace({ widget: new MarkdownFootnoteWidget(footnote), inclusive: false }).range(footnote.from, footnote.to));
  }
}
