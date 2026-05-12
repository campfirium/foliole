import type { MarkdownTablePlan, MarkdownTableRowPlan } from './markdownTablePlans';

function rangesOverlap(first: { from: number; to: number }, second: { from: number; to: number }) {
  return first.from < second.to && first.to > second.from;
}

function getVisibleTableRows(
  table: MarkdownTablePlan,
  viewport: { from: number; to: number }
): MarkdownTableRowPlan[] {
  const visibleRows = table.rows.filter((row) => rangesOverlap(row, viewport));
  const header = table.rows.find((row) => row.kind === 'header');
  if (!header || visibleRows.some((row) => row.kind === 'header')) return visibleRows;
  return [header, ...visibleRows.filter((row) => row.kind === 'body')];
}

function getTableRenderFrom(table: MarkdownTablePlan, viewport: { from: number; to: number }) {
  const visibleRow = table.rows.find((row) => rangesOverlap(row, viewport));
  if (visibleRow) return visibleRow.from;
  return Math.max(table.from, viewport.from);
}

export function collectViewportMarkdownTablePlans(
  tables: readonly MarkdownTablePlan[],
  viewport: { from: number; to: number }
): MarkdownTablePlan[] {
  return tables
    .filter((table) => !table.active && rangesOverlap(table, viewport))
    .map((table) => {
      const rows = getVisibleTableRows(table, viewport);
      return {
        ...table,
        anchorDecorations: table.anchorDecorations.filter((decoration) => rangesOverlap(decoration, viewport)),
        renderFrom: getTableRenderFrom(table, viewport),
        renderTo: Math.min(table.to, viewport.to),
        rows: rows.length > 0 ? rows : table.rows.slice(0, 1)
      };
    });
}

export function isPositionInsideInactiveTable(position: number, tables: readonly MarkdownTablePlan[]) {
  return tables.some((table) => !table.active && position >= table.from && position < table.to);
}
