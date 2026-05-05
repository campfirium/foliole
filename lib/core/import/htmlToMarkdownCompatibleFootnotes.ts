import type { DefaultTreeAdapterTypes } from 'parse5';

import { getAttribute } from './htmlToMarkdownCompatibleUtils.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;

export type HtmlFootnoteDefinitions = Map<string, string>;

const FOOTNOTE_DEFINITION_PATTERN = /^\s*(?:\[(?<bracketLabel>[^\]\n]+)\]|(?<plainLabel>\d+))\s*(?<note>.+)$/s;

export function collectHtmlFootnoteDefinitions(nodes: HtmlNode[]) {
  const definitions: HtmlFootnoteDefinitions = new Map();
  walkNodes(nodes, (node) => {
    if (!('tagName' in node) || !('childNodes' in node)) {
      return;
    }
    const rendered = renderFootnoteDefinitionBlock(node);
    if (!rendered || definitions.has(rendered.label)) {
      return;
    }
    definitions.set(rendered.label, rendered.note);
  });
  return definitions;
}

export function renderFootnoteDefinitionBlock(node: HtmlNode) {
  if (!('tagName' in node) || !('childNodes' in node)) {
    return null;
  }
  if (!['p', 'div', 'li'].includes(node.tagName)) {
    return null;
  }
  const text = getNodeText(node).trim();
  const match = FOOTNOTE_DEFINITION_PATTERN.exec(text);
  if (!match?.groups) {
    return null;
  }
  const label = normalizeFootnoteLabel(match.groups.bracketLabel ?? match.groups.plainLabel ?? '');
  const note = normalizeFootnoteNote(match.groups.note ?? '');
  if (!label || !note || note === label) {
    return null;
  }
  return { label, markdown: `^[${label}] ${note}`, note };
}

export function renderInlineFootnoteReference(node: HtmlElement, definitions: HtmlFootnoteDefinitions) {
  const label = normalizeFootnoteLabel(getNodeText(node));
  if (!label || !isInternalFootnoteHref(getAttribute(node, 'href'))) {
    return null;
  }
  const note = definitions.get(label);
  return note ? `^[${label}]{${escapeFootnoteText(note)}}` : `^[${label}]`;
}

export function renderInlineSuperscriptFootnote(node: HtmlElement) {
  if (node.tagName !== 'sup') {
    return null;
  }
  const label = normalizeFootnoteLabel(getNodeText(node));
  return label ? `^[${label}]` : null;
}

function walkNodes(nodes: HtmlNode[], visit: (node: HtmlNode) => void) {
  for (const node of nodes) {
    visit(node);
    if ('childNodes' in node) {
      walkNodes(node.childNodes, visit);
    }
  }
}

function getNodeText(node: HtmlNode): string {
  if (node.nodeName === '#text') {
    return 'value' in node ? normalizeWhitespace(node.value) : '';
  }
  if (!('childNodes' in node)) {
    return '';
  }
  return normalizeWhitespace(node.childNodes.map((child) => getNodeText(child)).join(' '));
}

function normalizeWhitespace(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeFootnoteLabel(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const bracketMatch = trimmed.match(/^\[(.+)\]$/);
  const candidate = (bracketMatch?.[1] ?? trimmed).trim();
  if (!/^\d+$/.test(candidate)) {
    return null;
  }
  return candidate;
}

function normalizeFootnoteNote(text: string) {
  return normalizeWhitespace(text);
}

function isInternalFootnoteHref(href: string | null) {
  if (!href) {
    return false;
  }
  return !/^[a-z]+:/i.test(href) && href.includes('#');
}

function escapeFootnoteText(note: string) {
  return note.replace(/\\/g, '\\\\').replace(/}/g, '\\}');
}

