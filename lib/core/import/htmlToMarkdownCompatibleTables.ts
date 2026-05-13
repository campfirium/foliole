import { type DefaultTreeAdapterTypes } from 'parse5';

import type { HtmlConversionWarning } from './htmlToMarkdownCompatible.js';
import type { HtmlFootnoteDefinitions } from './htmlToMarkdownCompatibleFootnotes.js';
import {
  findElements,
  getAttribute,
  isBlockNode,
  normalizeInline
} from './htmlToMarkdownCompatibleUtils.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlParentNode = DefaultTreeAdapterTypes.ParentNode;

export type RenderTableInlineNodes = (
  nodes: HtmlNode[],
  warnings: Set<HtmlConversionWarning>,
  footnoteDefinitions: HtmlFootnoteDefinitions
) => string;

export function renderTable(
  table: HtmlElement,
  warnings: Set<HtmlConversionWarning>,
  footnoteDefinitions: HtmlFootnoteDefinitions,
  renderInlineNodes: RenderTableInlineNodes
) {
  const markdownTable = renderGfmTable(table, warnings, footnoteDefinitions, renderInlineNodes);
  if (markdownTable) return markdownTable;
  return renderDegradedTable(table, warnings);
}

function renderGfmTable(
  table: HtmlElement,
  warnings: Set<HtmlConversionWarning>,
  footnoteDefinitions: HtmlFootnoteDefinitions,
  renderInlineNodes: RenderTableInlineNodes
) {
  const rows = findDescendantElements(table, 'tr').map((row) =>
    collectSimpleTableCells(row, warnings, footnoteDefinitions, renderInlineNodes)
  );
  if (rows.length === 0 || rows.some((row) => row === null)) return null;

  const normalizedRows = rows as string[][];
  const columnCount = normalizedRows[0]?.length ?? 0;
  if (columnCount === 0 || normalizedRows.some((row) => row.length !== columnCount)) return null;

  const delimiter = Array.from({ length: columnCount }, () => '---');
  const header = normalizedRows[0];
  if (!header) return null;
  return [header, delimiter, ...normalizedRows.slice(1)]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

function collectSimpleTableCells(
  row: HtmlElement,
  warnings: Set<HtmlConversionWarning>,
  footnoteDefinitions: HtmlFootnoteDefinitions,
  renderInlineNodes: RenderTableInlineNodes
) {
  const cells = findElements(row.childNodes, ['td', 'th']);
  if (cells.length === 0) return null;
  if (cells.some((cell) => getAttribute(cell, 'colspan') || getAttribute(cell, 'rowspan') || hasNestedBlockContent(cell))) {
    return null;
  }
  return cells.map((cell) =>
    escapeMarkdownTableCell(normalizeInline(renderInlineNodes(cell.childNodes, warnings, footnoteDefinitions)))
  );
}

function hasNestedBlockContent(cell: HtmlElement) {
  return cell.childNodes.some((node) => 'tagName' in node && (node.tagName === 'table' || isBlockNode(node)));
}

function escapeMarkdownTableCell(value: string) {
  return value.replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim() || ' ';
}

function renderDegradedTable(table: HtmlElement, warnings: Set<HtmlConversionWarning>) {
  warnings.add('table_degraded');
  const rows = findDescendantElements(table, 'tr').map((row) =>
    findElements(row.childNodes, ['td', 'th'])
      .map((cell) => normalizeInline(getTextContent(cell)))
      .filter(Boolean)
      .join(' | ')
  );
  const lines = rows.filter(Boolean);
  return lines.length > 0 ? ['[Table degraded]', ...lines].join('\n') : '[Table degraded]';
}

function findDescendantElements(node: HtmlParentNode, tagName: string): HtmlElement[] {
  if (!('childNodes' in node)) return [];
  const matches: HtmlElement[] = [];
  for (const child of node.childNodes) {
    if ('tagName' in child && child.tagName === tagName) matches.push(child);
    if ('childNodes' in child) matches.push(...findDescendantElements(child, tagName));
  }
  return matches;
}

function getTextContent(node: HtmlParentNode | HtmlNode): string {
  if (node.nodeName === '#text') return normalizeInline((node as DefaultTreeAdapterTypes.TextNode).value);
  if (!('childNodes' in node)) return '';
  return node.childNodes.map((child) => getTextContent(child)).join('');
}
