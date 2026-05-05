import { markdownLanguage } from '@codemirror/lang-markdown';

import type { EditorTextAnchorDecoration } from '../adapters/EditorAdapter';

type MarkdownSyntaxTree = ReturnType<typeof markdownLanguage.parser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export interface MarkdownTableCellPlan {
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
  rows: MarkdownTableRowPlan[];
  to: number;
}

function collectChildCells(node: MarkdownSyntaxNode, source: string, offset: number): MarkdownTableCellPlan[] {
  const cells: MarkdownTableCellPlan[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'TableCell') continue;
    cells.push({
      from: offset + child.from,
      text: source.slice(child.from, child.to),
      to: offset + child.to
    });
  }
  return cells;
}

function collectTableRows(tableNode: MarkdownSyntaxNode, source: string, offset: number): MarkdownTableRowPlan[] {
  const rows: MarkdownTableRowPlan[] = [];
  let columnCount = 0;

  for (let child = tableNode.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'TableHeader' && child.name !== 'TableRow') continue;

    const cells = collectChildCells(child, source, offset);
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
  node: MarkdownSyntaxNode;
  offset: number;
  source: string;
}): MarkdownTablePlan | null {
  const rows = collectTableRows(args.node, args.source, args.offset);
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
  text: string;
}): MarkdownTablePlan[] {
  const tree = markdownLanguage.parser.parse(args.text);
  const tables: MarkdownTablePlan[] = [];

  visitTableNodes(tree.topNode, (node) => {
    const plan = collectTablePlanFromNode({
      activePosition: args.activePosition,
      anchorDecorations: args.anchorDecorations ?? [],
      node,
      offset: args.from,
      source: args.text
    });
    if (plan) tables.push(plan);
  });

  return tables;
}

export function isPositionInsideInactiveTable(position: number, tables: readonly MarkdownTablePlan[]) {
  return tables.some((table) => !table.active && position >= table.from && position < table.to);
}
