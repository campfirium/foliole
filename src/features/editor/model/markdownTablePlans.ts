import type { EditorTextAnchorDecoration } from '../adapters/EditorAdapter';

import { folioleMarkdownParser } from './folioleMarkdownParser';
import type { MarkdownLinkReferenceMap } from './markdownLinkReferences';

type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export type MarkdownTableCellAlignment = 'center' | 'left' | 'right' | null;

export interface MarkdownTableCellPlan {
  align: MarkdownTableCellAlignment;
  from: number;
  text: string;
  to: number;
}

export interface MarkdownTableRowPlan {
  cells: MarkdownTableCellPlan[];
  from: number;
  kind: 'body' | 'header';
  to: number;
}

export interface MarkdownTablePlan {
  active: boolean;
  anchorDecorations: readonly EditorTextAnchorDecoration[];
  columnCount: number;
  from: number;
  linkReferences?: MarkdownLinkReferenceMap;
  renderFrom?: number;
  renderTo?: number;
  rows: MarkdownTableRowPlan[];
  to: number;
}

export function getMarkdownTableCellAnchorClasses(
  cell: MarkdownTableCellPlan,
  decorations: readonly EditorTextAnchorDecoration[]
) {
  const overlapping = decorations.filter((decoration) => decoration.from < cell.to && decoration.to > cell.from);
  return {
    hasCloze: overlapping.some((decoration) => decoration.kind === 'cloze'),
    hasHighlight: overlapping.some((decoration) => decoration.kind === 'highlight')
  };
}

function collectChildCells(
  node: MarkdownSyntaxNode,
  source: string,
  offset: number,
  alignments: readonly MarkdownTableCellAlignment[]
): MarkdownTableCellPlan[] {
  const cells: MarkdownTableCellPlan[] = [];
  let cellIndex = 0;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'TableCell') continue;
    cells.push({
      align: alignments[cellIndex] ?? null,
      from: offset + child.from,
      text: source.slice(child.from, child.to),
      to: offset + child.to
    });
    cellIndex += 1;
  }
  return cells;
}

function collectTableRows(
  tableNode: MarkdownSyntaxNode,
  source: string,
  offset: number,
  alignments: readonly MarkdownTableCellAlignment[]
): MarkdownTableRowPlan[] {
  const rows: MarkdownTableRowPlan[] = [];
  let columnCount = 0;

  for (let child = tableNode.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'TableHeader' && child.name !== 'TableRow') continue;

    const cells = collectChildCells(child, source, offset, alignments);
    if (child.name === 'TableHeader') {
      columnCount = cells.length;
    }
    if (cells.length === 0 || (columnCount > 0 && child.name === 'TableRow' && cells.length > columnCount)) {
      continue;
    }

    rows.push({
      cells,
      from: offset + child.from,
      kind: child.name === 'TableHeader' ? 'header' : 'body',
      to: offset + child.to
    });
  }

  return rows.filter((row) => row.kind === 'header' || row.cells.length === columnCount);
}

function resolveTableAlignments(tableNode: MarkdownSyntaxNode, source: string): MarkdownTableCellAlignment[] {
  for (let child = tableNode.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter') {
      return splitDelimiterCells(source.slice(child.from, child.to)).map(resolveDelimiterAlignment);
    }
  }
  return [];
}

function splitDelimiterCells(delimiterLine: string) {
  const trimmed = delimiterLine.trim();
  const withoutLeadingPipe = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutBoundaryPipes = withoutLeadingPipe.endsWith('|') ? withoutLeadingPipe.slice(0, -1) : withoutLeadingPipe;
  return withoutBoundaryPipes.split('|').map((cell) => cell.trim());
}

function resolveDelimiterAlignment(cell: string): MarkdownTableCellAlignment {
  const startsWithColon = cell.startsWith(':');
  const endsWithColon = cell.endsWith(':');
  if (startsWithColon && endsWithColon) return 'center';
  if (endsWithColon) return 'right';
  if (startsWithColon) return 'left';
  return null;
}

function resolveTableDelimiterTo(tableNode: MarkdownSyntaxNode, offset: number, headerTo: number) {
  let delimiterTo = headerTo;
  for (let child = tableNode.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter' && offset + child.to > delimiterTo) {
      delimiterTo = offset + child.to;
    }
  }
  return delimiterTo;
}

function collectTablePlanFromNode(args: {
  activePosition: number | null;
  anchorDecorations: readonly EditorTextAnchorDecoration[];
  linkReferences?: MarkdownLinkReferenceMap;
  node: MarkdownSyntaxNode;
  offset: number;
  source: string;
}): MarkdownTablePlan | null {
  const alignments = resolveTableAlignments(args.node, args.source);
  const rows = collectTableRows(args.node, args.source, args.offset, alignments);
  const header = rows.find((row) => row.kind === 'header');
  if (!header || header.cells.length === 0) return null;

  const lastRow = rows[rows.length - 1] ?? header;
  const tableFrom = header.from;
  const tableTo = Math.max(
    lastRow.to,
    resolveTableDelimiterTo(args.node, args.offset, header.to)
  );
  const anchorDecorations = args.anchorDecorations.filter((decoration) => (
    decoration.from < tableTo && decoration.to > tableFrom
  ));

  return {
    active: args.activePosition !== null && args.activePosition >= tableFrom && args.activePosition <= tableTo,
    anchorDecorations,
    columnCount: header.cells.length,
    from: tableFrom,
    linkReferences: args.linkReferences,
    rows,
    to: tableTo
  };
}

function visitTableNodes(
  node: MarkdownSyntaxNode,
  visitor: (node: MarkdownSyntaxNode) => void
) {
  if (node.name === 'Table') visitor(node);
  for (let child = node.firstChild; child; child = child.nextSibling) {
    visitTableNodes(child, visitor);
  }
}

export function collectMarkdownTablePlans(args: {
  activePosition: number | null;
  anchorDecorations?: readonly EditorTextAnchorDecoration[];
  from: number;
  linkReferences?: MarkdownLinkReferenceMap;
  text: string;
}): MarkdownTablePlan[] {
  const tree = folioleMarkdownParser.parse(args.text);
  const tables: MarkdownTablePlan[] = [];

  visitTableNodes(tree.topNode, (node) => {
    const plan = collectTablePlanFromNode({
      activePosition: args.activePosition,
      anchorDecorations: args.anchorDecorations ?? [],
      linkReferences: args.linkReferences,
      node,
      offset: args.from,
      source: args.text
    });
    if (plan) tables.push(plan);
  });

  return tables;
}

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
