import { parse, type DefaultTreeAdapterTypes } from 'parse5';

import {
  convertHtmlToMarkdownCompatible,
  formatHtmlConversionDegradedReason
} from '../../lib/core/import/htmlToMarkdownCompatible.js';
import { extractUniqueLevelOneHeading } from '../../lib/core/import/importedNodeTitle.js';

import {
  extractFirstMeaningfulBodyLine,
  extractFirstMarkdownHeadingText,
  increaseMarkdownHeadingLevels,
  normalizePageTitle
} from './epubImportChapterHeuristics.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;

function collectText(node: HtmlNode): string {
  if (node.nodeName === '#text') {
    return ('value' in node ? node.value : '').replace(/\s+/g, ' ').trim();
  }
  if (!('childNodes' in node)) {
    return '';
  }
  return node.childNodes.map((child) => collectText(child)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function findFirstText(node: HtmlNode, tagName: string): string | null {
  if ('tagName' in node && (node as HtmlElement).tagName === tagName) {
    return collectText(node) || null;
  }
  if (!('childNodes' in node)) {
    return null;
  }
  for (const child of node.childNodes) {
    const match = findFirstText(child, tagName);
    if (match) {
      return match;
    }
  }
  return null;
}

function findFirstHeadingText(node: HtmlNode): string | null {
  if ('tagName' in node && /^h[1-6]$/.test((node as HtmlElement).tagName)) {
    const element = node as HtmlElement;
    if (element.attrs.some((attribute) => attribute.name === 'hidden' && attribute.value !== 'false')) {
      return null;
    }
    return collectText(node) || null;
  }
  if (!('childNodes' in node)) {
    return null;
  }
  for (const child of node.childNodes) {
    const match = findFirstHeadingText(child);
    if (match) {
      return match;
    }
  }
  return null;
}

export function buildChapterMarkdown(html: string, fallbackTitle: string) {
  const document = parse(html);
  const pageTitle = normalizePageTitle(findFirstText(document, 'title'));
  const firstHeading = findFirstHeadingText(document);
  const converted = convertHtmlToMarkdownCompatible(html);
  const body = converted.content.trim();
  const bodyTitle = extractFirstMarkdownHeadingText(body) ?? extractUniqueLevelOneHeading(body) ?? extractFirstMeaningfulBodyLine(body);
  const resolvedTitle = pageTitle ?? firstHeading ?? bodyTitle ?? fallbackTitle;
  const needsTitleHeading =
    Boolean(body) &&
    (!bodyTitle || bodyTitle !== resolvedTitle) &&
    (Boolean(pageTitle) || Boolean(firstHeading) || resolvedTitle !== fallbackTitle);
  return {
    content: needsTitleHeading && body ? `# ${resolvedTitle}\n\n${increaseMarkdownHeadingLevels(body)}` : body || `# ${resolvedTitle}`,
    degradedReason: formatHtmlConversionDegradedReason(converted.warnings),
    title: resolvedTitle
  };
}
