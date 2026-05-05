import { parse, parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

import {
  collectHtmlFootnoteDefinitions,
  renderFootnoteDefinitionBlock,
  renderInlineFootnoteReference,
  renderInlineSuperscriptFootnote,
  type HtmlFootnoteDefinitions
} from './htmlToMarkdownCompatibleFootnotes.js';
import { renderTable } from './htmlToMarkdownCompatibleTables.js';
import {
  buildEmbedPlaceholder,
  buildImageMarkdown,
  CONTENT_STRIP_TAGS,
  EMBEDDED_TAGS,
  findElement,
  getAttribute,
  indentLines,
  isBlockNode,
  normalizeInline,
  normalizeMarkdown,
  normalizeTextNode,
  prefixLines,
  sanitizeMarkdownUrl,
  wrapCode
} from './htmlToMarkdownCompatibleUtils.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlParentNode = DefaultTreeAdapterTypes.ParentNode;
type HtmlTextNode = DefaultTreeAdapterTypes.TextNode;

export type HtmlConversionWarning = 'embedded_content_replaced' | 'table_degraded';

const HTML_CONVERSION_WARNING_LABELS: Record<HtmlConversionWarning, string> = {
  embedded_content_replaced: 'embedded content',
  table_degraded: 'table'
};

export interface HtmlToMarkdownCompatibleResult {
  content: string;
  warnings: HtmlConversionWarning[];
}

export function formatHtmlConversionDegradedReason(warnings: HtmlConversionWarning[]) {
  if (warnings.length === 0) {
    return null;
  }
  const warningLabels = [...new Set(warnings)].map((warning) => HTML_CONVERSION_WARNING_LABELS[warning]);
  return `HTML conversion degraded: ${warningLabels.join(', ')}`;
}

export function convertHtmlToMarkdownCompatible(html: string): HtmlToMarkdownCompatibleResult {
  const warnings = new Set<HtmlConversionWarning>();
  const rootNodes = selectRootNodes(html.replace(/\r\n?/g, '\n'));
  const footnoteDefinitions = collectHtmlFootnoteDefinitions(rootNodes);
  const content = normalizeMarkdown(renderBlockNodes(rootNodes, warnings, footnoteDefinitions).join('\n\n'));
  return { content, warnings: [...warnings] };
}

function selectRootNodes(html: string) {
  if (/<(?:!doctype|html|body)\b/i.test(html)) {
    const document = parse(html);
    const htmlElement = findElement(document.childNodes, 'html');
    const bodyElement = htmlElement ? findElement(htmlElement.childNodes, 'body') : null;
    return bodyElement?.childNodes ?? document.childNodes;
  }
  return parseFragment(html).childNodes;
}

function renderBlockNodes(nodes: HtmlNode[], warnings: Set<HtmlConversionWarning>, footnoteDefinitions: HtmlFootnoteDefinitions) {
  const blocks: string[] = [];
  let inlineNodes: HtmlNode[] = [];
  const flushInline = () => {
    const inline = normalizeInline(renderInlineNodes(inlineNodes, warnings, footnoteDefinitions));
    if (inline) blocks.push(inline);
    inlineNodes = [];
  };
  for (const node of nodes) {
    if (isBlockNode(node)) {
      flushInline();
      blocks.push(...renderBlockNode(node, warnings, footnoteDefinitions));
      continue;
    }
    inlineNodes.push(node);
  }
  flushInline();
  return blocks.filter(Boolean);
}

function renderBlockNode(node: HtmlNode, warnings: Set<HtmlConversionWarning>, footnoteDefinitions: HtmlFootnoteDefinitions): string[] {
  if (isTextNode(node)) {
    const text = normalizeInline(node.value);
    return text ? [text] : [];
  }
  if (!('tagName' in node)) {
    return [];
  }
  if (CONTENT_STRIP_TAGS.has(node.tagName)) {
    return [];
  }
  if (EMBEDDED_TAGS.has(node.tagName)) {
    warnings.add('embedded_content_replaced');
    return [buildEmbedPlaceholder(node)];
  }
  if (node.tagName === 'hr') return ['---'];
  if (node.tagName === 'pre') return [renderCodeFence(node)];
  if (node.tagName === 'blockquote') return [prefixLines(joinBlocks(node.childNodes, warnings, footnoteDefinitions), '> ')];
  if (node.tagName === 'table') return [renderTable(node, warnings, footnoteDefinitions, renderInlineNodes)];
  if (node.tagName === 'ul' || node.tagName === 'ol') return renderList(node, warnings, footnoteDefinitions);
  const footnoteDefinition = renderFootnoteDefinitionBlock(node);
  if (footnoteDefinition) return [footnoteDefinition.markdown];
  if (/^h[1-6]$/.test(node.tagName)) {
    const level = Number.parseInt(node.tagName.slice(1), 10);
    const heading = normalizeInline(renderInlineNodes(node.childNodes, warnings, footnoteDefinitions));
    return heading ? [`${'#'.repeat(level)} ${heading}`] : [];
  }
  if (node.tagName === 'p') {
    const paragraph = normalizeInline(renderInlineNodes(node.childNodes, warnings, footnoteDefinitions));
    return paragraph ? [paragraph] : [];
  }
  return renderBlockNodes(node.childNodes, warnings, footnoteDefinitions);
}

function renderList(list: HtmlElement, warnings: Set<HtmlConversionWarning>, footnoteDefinitions: HtmlFootnoteDefinitions) {
  const items = list.childNodes.filter((node): node is HtmlElement => 'tagName' in node && node.tagName === 'li');
  return items.map((item, index) => renderListItem(item, list.tagName === 'ol', index, warnings, footnoteDefinitions)).filter(Boolean);
}

function renderListItem(
  item: HtmlElement,
  ordered: boolean,
  index: number,
  warnings: Set<HtmlConversionWarning>,
  footnoteDefinitions: HtmlFootnoteDefinitions
) {
  const prefix = ordered ? `${index + 1}. ` : '- ';
  const blocks = renderBlockNodes(item.childNodes, warnings, footnoteDefinitions);
  if (blocks.length === 0) return prefix.trimEnd();
  const continuation = ' '.repeat(prefix.length);
  const [firstBlock, ...restBlocks] = blocks;
  return [
    `${prefix}${firstBlock}`,
    ...restBlocks.map((block) => indentLines(block, continuation))
  ].join('\n');
}

function renderInlineNodes(nodes: HtmlNode[], warnings: Set<HtmlConversionWarning>, footnoteDefinitions: HtmlFootnoteDefinitions) {
  return nodes.map((node) => renderInlineNode(node, warnings, footnoteDefinitions)).join('');
}

function renderInlineNode(node: HtmlNode, warnings: Set<HtmlConversionWarning>, footnoteDefinitions: HtmlFootnoteDefinitions): string {
  if (isTextNode(node)) {
    return normalizeTextNode(node.value);
  }
  if (!('tagName' in node) || CONTENT_STRIP_TAGS.has(node.tagName)) {
    return '';
  }
  if (node.tagName === 'br') return '  \n';
  if (node.tagName === 'code') return wrapCode(normalizeInline(getTextContent(node, true)));
  if (node.tagName === 'img') return buildImageMarkdown(node);
  if (EMBEDDED_TAGS.has(node.tagName)) {
    warnings.add('embedded_content_replaced');
    return buildEmbedPlaceholder(node);
  }

  const inline = renderInlineNodes(node.childNodes, warnings, footnoteDefinitions);
  if (node.tagName === 'sup') {
    if (/^\^\[[^\]\n]+\](?:\{.*\})?$/.test(inline)) {
      return inline;
    }
    const superscriptFootnote = renderInlineSuperscriptFootnote(node);
    if (superscriptFootnote) return superscriptFootnote;
    if (inline) {
      return inline;
    }
  }
  if (node.tagName === 'a') {
    const footnoteReference = renderInlineFootnoteReference(node, footnoteDefinitions);
    if (footnoteReference) return footnoteReference;
    const href = sanitizeMarkdownUrl(getAttribute(node, 'href'));
    const label = normalizeInline(inline) || href || 'link';
    return href ? `[${label}](${href})` : label;
  }
  const superscriptFootnote = renderInlineSuperscriptFootnote(node);
  if (superscriptFootnote) return superscriptFootnote;
  return applyInlineFormatting(node, inline);
}

function renderCodeFence(node: HtmlElement) {
  const code = getTextContent(node, true).replace(/^\n+|\n+$/g, '');
  return ['```', code, '```'].join('\n');
}

function applyInlineFormatting(node: HtmlElement, content: string) {
  const text = content || normalizeInline(getTextContent(node));
  if (!text) return '';
  const style = (getAttribute(node, 'style') ?? '').toLowerCase();
  const formats = [
    node.tagName === 'strong' || node.tagName === 'b' || /font-weight\s*:\s*(bold|[6-9]00)/.test(style) ? '**' : '',
    node.tagName === 'em' || node.tagName === 'i' || /font-style\s*:\s*italic/.test(style) ? '*' : '',
    ['del', 's', 'strike'].includes(node.tagName) || /line-through/.test(style) ? '~~' : ''
  ].filter(Boolean);
  return formats.reduce((wrapped, marker) => `${marker}${wrapped}${marker}`, text);
}

function getTextContent(node: HtmlParentNode | HtmlNode, preserveWhitespace = false): string {
  if (isTextNode(node)) {
    return preserveWhitespace ? node.value : normalizeTextNode(node.value);
  }
  if (!('childNodes' in node) || CONTENT_STRIP_TAGS.has(node.nodeName)) {
    return '';
  }
  return node.childNodes.map((child) => getTextContent(child, preserveWhitespace)).join('');
}

function joinBlocks(nodes: HtmlNode[], warnings: Set<HtmlConversionWarning>, footnoteDefinitions: HtmlFootnoteDefinitions) {
  return renderBlockNodes(nodes, warnings, footnoteDefinitions).join('\n\n');
}

function isTextNode(node: HtmlParentNode | HtmlNode): node is HtmlTextNode {
  return node.nodeName === '#text';
}
