import type { Range, Text } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import { buildFootnotePresentation } from '../model/footnotePresentation';
import { tokenizeMarkdownTableInlineText } from '../model/markdownTableInline';
import {
  getMarkdownTableCellAnchorClasses,
  type MarkdownTableCellAlignment,
  type MarkdownTableCellPlan,
  type MarkdownTablePlan
} from '../model/markdownTablePlans';
import { dispatchMarkdownTablePreviewRequest } from '../model/markdownTablePreview';

import type { EditorTextAnchorDecoration } from './EditorAdapter';

function appendInlineText(container: HTMLElement, text: string) {
  for (const token of tokenizeMarkdownTableInlineText(text)) {
    if (token.kind === 'text') container.append(document.createTextNode(token.text));
    if (token.kind === 'emphasis') appendEmphasisElement(container, token.text);
    if (token.kind === 'strong') appendStrongElement(container, token.text);
    if (token.kind === 'strikethrough') appendStrikethroughElement(container, token.text);
    if (token.kind === 'sourceHighlight') appendSourceHighlightElement(container, token.text);
    if (token.kind === 'inlineCode') appendInlineCodeElement(container, token.text);
    if (token.kind === 'autolink') appendAutolinkElement(container, token.text, token.href);
    if (token.kind === 'footnote') appendFootnoteElement(container, token.label, token.note);
    if (token.kind === 'link') appendAutolinkElement(container, token.text, token.href);
    if (token.kind === 'wikiLink') appendWikiLinkElement(container, token.text, token.title);
  }
}

function appendEmphasisElement(container: HTMLElement, text: string) {
  const emphasis = document.createElement('span');
  emphasis.className = 'cm-md-emphasis';
  emphasis.textContent = text;
  container.append(emphasis);
}

function appendStrongElement(container: HTMLElement, text: string) {
  const strong = document.createElement('span');
  strong.className = 'cm-md-strong';
  strong.textContent = text;
  container.append(strong);
}

function appendStrikethroughElement(container: HTMLElement, text: string) {
  const strike = document.createElement('span');
  strike.className = 'cm-md-strikethrough';
  strike.textContent = text;
  container.append(strike);
}

function appendSourceHighlightElement(container: HTMLElement, text: string) {
  const highlight = document.createElement('span');
  highlight.className = 'cm-md-source-highlight';
  highlight.textContent = text;
  container.append(highlight);
}

function appendInlineCodeElement(container: HTMLElement, text: string) {
  const code = document.createElement('code');
  code.className = 'cm-md-inline-code';
  code.textContent = text;
  container.append(code);
}

function appendAutolinkElement(container: HTMLElement, linkText: string, href: string) {
  const link = document.createElement('span');
  link.className = 'cm-md-link-text';
  link.dataset.mdLinkUrl = href;
  link.textContent = linkText;
  container.append(link);
}

function appendWikiLinkElement(container: HTMLElement, label: string, title: string) {
  const link = document.createElement('span');
  link.className = 'cm-md-link-text';
  link.dataset.mdLinkNodeTitle = title;
  link.textContent = label;
  container.append(link);
}

function appendFootnoteElement(container: HTMLElement, label: string, note: string | null) {
  const presentation = buildFootnotePresentation({ label, note });
  const wrapper = document.createElement('span');
  wrapper.className = 'cm-md-footnote-widget';
  wrapper.dataset.mdFootnoteLabel = presentation.label;
  wrapper.dataset.mdFootnoteStatus = presentation.status;

  const marker = document.createElement('span');
  marker.className = 'cm-md-footnote-marker';
  marker.textContent = presentation.label;
  marker.setAttribute('aria-label', presentation.ariaLabel);
  if (presentation.note) marker.title = presentation.note;
  wrapper.append(marker);
  container.append(wrapper);
}

function createCellElement(
  cell: MarkdownTableCellPlan,
  tagName: 'td' | 'th',
  decorations: readonly EditorTextAnchorDecoration[]
) {
  const element = document.createElement(tagName);
  element.className = 'cm-md-table-cell';
  const { hasCloze, hasHighlight } = getMarkdownTableCellAnchorClasses(cell, decorations);
  if (hasHighlight) element.classList.add('cm-md-highlight');
  if (hasCloze) element.classList.add('cm-md-cloze');
  applyCellAlignment(element, cell.align);
  appendInlineText(element, cell.text.trim());
  return element;
}

function applyCellAlignment(element: HTMLElement, align: MarkdownTableCellAlignment) {
  if (align) {
    element.style.textAlign = align;
  }
}

function createTableElement(tablePlan: MarkdownTablePlan) {
  const wrapper = document.createElement('div');
  wrapper.className = 'cm-md-table-widget';
  wrapper.dataset.mdTableFrom = String(tablePlan.from);
  wrapper.dataset.mdTableTo = String(tablePlan.to);

  wrapper.append(createTablePreviewButton(tablePlan));

  const table = document.createElement('table');
  table.className = 'cm-md-table';
  const body = document.createElement('tbody');

  for (const row of tablePlan.rows) {
    const rowElement = document.createElement('tr');
    rowElement.className = row.kind === 'header' ? 'cm-md-table-row cm-md-table-row-header' : 'cm-md-table-row';
    for (let index = 0; index < tablePlan.columnCount; index += 1) {
      const cell = row.cells[index] ?? { align: null, from: row.to, text: '', to: row.to };
      rowElement.append(createCellElement(cell, row.kind === 'header' ? 'th' : 'td', tablePlan.anchorDecorations));
    }
    body.append(rowElement);
  }

  table.append(body);
  wrapper.append(table);
  return wrapper;
}

function createTablePreviewButton(tablePlan: MarkdownTablePlan) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cm-md-table-preview-button';
  button.setAttribute('aria-label', 'Open table preview');
  button.title = 'Open table preview';
  button.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M14 10l7-7"/><path d="M9 21H3v-6"/><path d="M10 14l-7 7"/></svg>';
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dispatchMarkdownTablePreviewRequest(button, { table: tablePlan });
  });
  return button;
}

class MarkdownTableWidget extends WidgetType {
  readonly tablePlan: MarkdownTablePlan;

  constructor(tablePlan: MarkdownTablePlan) {
    super();
    this.tablePlan = tablePlan;
  }

  eq(other: MarkdownTableWidget) {
    return (
      this.tablePlan.from === other.tablePlan.from &&
      this.tablePlan.to === other.tablePlan.to &&
      this.tablePlan.rows.length === other.tablePlan.rows.length &&
      this.tablePlan.anchorDecorations.length === other.tablePlan.anchorDecorations.length
    );
  }

  toDOM() {
    return createTableElement(this.tablePlan);
  }
}

function addHiddenSourceLine(ranges: Range<Decoration>[], from: number, to: number) {
  ranges.push(Decoration.line({ attributes: { class: 'cm-md-table-source-hidden' } }).range(from));
  if (to > from) {
    ranges.push(Decoration.replace({ inclusive: false }).range(from, to));
  }
}

export function addTableDecorations(
  ranges: Range<Decoration>[],
  tables: readonly MarkdownTablePlan[],
  doc: Text
) {
  for (const table of tables) {
    if (table.active) continue;
    const firstLine = doc.lineAt(table.from);
    ranges.push(
      Decoration.replace({
        inclusive: false,
        widget: new MarkdownTableWidget(table)
      }).range(table.from, Math.min(firstLine.to, table.to))
    );

    let lineNumber = firstLine.number + 1;
    while (lineNumber <= doc.lineAt(Math.max(table.to - 1, table.from)).number) {
      const line = doc.line(lineNumber);
      addHiddenSourceLine(ranges, line.from, Math.min(line.to, table.to));
      lineNumber += 1;
    }
  }
}
