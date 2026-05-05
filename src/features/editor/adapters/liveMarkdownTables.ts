import type { Range, Text } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import type { MarkdownTableCellPlan, MarkdownTablePlan } from '../model/markdownTablePlans';
import { dispatchMarkdownTablePreviewRequest } from '../model/markdownTablePreview';

import type { EditorTextAnchorDecoration } from './EditorAdapter';

const INLINE_TABLE_TOKEN_PATTERN =
  /~~(.+?)~~|\b(?:https?:\/\/[^\s<>()\]]+|www\.[^\s<>()\]]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const AUTOLINK_TRAILING_PUNCTUATION_PATTERN = /[.,;:!?]+$/;

function getCellAnchorClasses(cell: MarkdownTableCellPlan, decorations: readonly EditorTextAnchorDecoration[]) {
  const overlapping = decorations.filter((decoration) => decoration.from < cell.to && decoration.to > cell.from);
  return {
    hasCloze: overlapping.some((decoration) => decoration.kind === 'cloze'),
    hasHighlight: overlapping.some((decoration) => decoration.kind === 'highlight')
  };
}

function appendInlineText(container: HTMLElement, text: string) {
  let cursor = 0;
  let match = INLINE_TABLE_TOKEN_PATTERN.exec(text);

  while (match) {
    const start = match.index;
    if (start > cursor) container.append(document.createTextNode(text.slice(cursor, start)));

    const matchText = match[0] ?? '';
    if (matchText.startsWith('~~')) {
      appendStrikethroughElement(container, match[1] ?? '');
    } else {
      appendAutolinkElement(container, matchText);
    }

    cursor = start + matchText.length;
    match = INLINE_TABLE_TOKEN_PATTERN.exec(text);
  }

  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

function appendStrikethroughElement(container: HTMLElement, text: string) {
  const strike = document.createElement('span');
  strike.className = 'cm-md-strikethrough';
  strike.textContent = text;
  container.append(strike);
}

function appendAutolinkElement(container: HTMLElement, rawText: string) {
  const linkText = rawText.replace(AUTOLINK_TRAILING_PUNCTUATION_PATTERN, '');
  const trailingText = rawText.slice(linkText.length);
  const link = document.createElement('span');
  link.className = 'cm-md-link-text';
  link.dataset.mdLinkUrl = normalizeAutolinkHref(linkText);
  link.textContent = linkText;
  container.append(link);
  if (trailingText) container.append(document.createTextNode(trailingText));
}

function normalizeAutolinkHref(text: string) {
  if (text.startsWith('www.')) return `https://${text}`;
  if (text.includes('@') && !text.includes('://')) return `mailto:${text}`;
  return text;
}

function createCellElement(
  cell: MarkdownTableCellPlan,
  tagName: 'td' | 'th',
  decorations: readonly EditorTextAnchorDecoration[]
) {
  const element = document.createElement(tagName);
  element.className = 'cm-md-table-cell';
  const { hasCloze, hasHighlight } = getCellAnchorClasses(cell, decorations);
  if (hasHighlight) element.classList.add('cm-md-highlight');
  if (hasCloze) element.classList.add('cm-md-cloze');
  appendInlineText(element, cell.text.trim());
  return element;
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
      const cell = row.cells[index] ?? { from: row.to, text: '', to: row.to };
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
