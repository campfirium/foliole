import type { Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

import type { ViewportPreviewLinePlan } from '../model/liveMarkdownViewportPlans';
import type { MarkdownTablePlan } from '../model/markdownTablePlans';

function isInsideInactiveTable(position: number, tables: readonly MarkdownTablePlan[]) {
  return tables.some((table) => !table.active && position >= table.from && position < table.to);
}

function isEmptyPipeScaffoldLine(text: string) {
  return text.includes('|') && /^[\s|]+$/.test(text);
}

function addHiddenSourceLine(ranges: Range<Decoration>[], from: number, to: number) {
  ranges.push(Decoration.line({ attributes: { class: 'cm-md-table-source-hidden' } }).range(from));
  if (to > from) {
    ranges.push(Decoration.replace({ inclusive: false }).range(from, to));
  }
}

export function addOrphanTableScaffoldDecorations(
  ranges: Range<Decoration>[],
  lines: readonly ViewportPreviewLinePlan[],
  tables: readonly MarkdownTablePlan[]
) {
  for (const line of lines) {
    if (isInsideInactiveTable(line.lineFrom, tables)) continue;
    if (isEmptyPipeScaffoldLine(line.lineText)) {
      addHiddenSourceLine(ranges, line.lineFrom, line.lineFrom + line.lineText.length);
    }
  }
}
