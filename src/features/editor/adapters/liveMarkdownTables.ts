import type { Range, Text } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import type { MarkdownTableCellPlan, MarkdownTablePlan } from '../model/markdownTablePlans';

import type { EditorTextAnchorDecoration } from './EditorAdapter';

function getCellAnchorClasses(cell: MarkdownTableCellPlan, decorations: readonly EditorTextAnchorDecoration[]) {
  const overlapping = decorations.filter((decoration) => decoration.from < cell.to && decoration.to > cell.from);
  return {
    hasCloze: overlapping.some((decoration) => decoration.kind === 'cloze'),
    hasHighlight: overlapping.some((decoration) => decoration.kind === 'highlight')
  };
}

function appendInlineText(container: HTMLElement, text: string) {
  let cursor = 0;
  const pattern = /~~(.+?)~~/g;
  let match = pattern.exec(text);

  while (match) {
    const start = match.index;
    if (start > cursor) container.append(document.createTextNode(text.slice(cursor, start)));

    const strike = document.createElement('span');
    strike.className = 'cm-md-strikethrough';
    strike.textContent = match[1] ?? '';
    container.append(strike);

    cursor = start + match[0].length;
    match = pattern.exec(text);
  }

  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
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
