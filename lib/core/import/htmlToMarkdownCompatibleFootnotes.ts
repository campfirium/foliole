import type { DefaultTreeAdapterTypes } from 'parse5';

import { getAttribute } from './htmlToMarkdownCompatibleUtils.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;

export interface HtmlFootnoteDefinitions {
  byAnchorId: Map<string, string>;
  byBacklinkId: Map<string, string>;
  byLabel: Map<string, string>;
}

interface RenderedHtmlFootnoteDefinition {
  anchorIds: string[];
  backlinkIds: string[];
  label: string;
  markdown: string;
  note: string;
}

const FOOTNOTE_DEFINITION_PATTERN = /^\s*(?:\[(?<bracketLabel>[^\]\n]+)\]|(?<plainLabel>\d+))\s*(?<note>.+)$/s;
const FOOTNOTE_ATTRIBUTE_PATTERN = /(?:^|[^a-z])(annot|annotation|note|noteref|footnote|footnoteref|fn|fnref)(?:[^a-z]|$)/i;
const FOOTNOTE_FRAGMENT_PATTERN = /^(annot|annotation|note|noteref|footnote|footnoteref|fn|fnref)\d*$/i;
const FOOTNOTE_REFERENCE_FRAGMENT_PATTERN = /^ref\d+$/i;

export function collectHtmlFootnoteDefinitions(nodes: HtmlNode[]) {
  const definitions: HtmlFootnoteDefinitions = {
    byAnchorId: new Map(),
    byBacklinkId: new Map(),
    byLabel: new Map()
  };
  walkNodes(nodes, (node) => {
    if (!('tagName' in node) || !('childNodes' in node)) {
      return;
    }
    const rendered = renderFootnoteDefinitionBlock(node);
    if (!rendered) {
      return;
    }
    if (!definitions.byLabel.has(rendered.label)) {
      definitions.byLabel.set(rendered.label, rendered.note);
    }
    for (const anchorId of rendered.anchorIds) {
      if (!definitions.byAnchorId.has(anchorId)) {
        definitions.byAnchorId.set(anchorId, rendered.note);
      }
    }
    for (const backlinkId of rendered.backlinkIds) {
      if (!definitions.byBacklinkId.has(backlinkId)) {
        definitions.byBacklinkId.set(backlinkId, rendered.note);
      }
    }
  });
  return definitions;
}

export function renderFootnoteDefinitionBlock(node: HtmlNode): RenderedHtmlFootnoteDefinition | null {
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
  if (!label || !note || note === label || !isFootnoteDefinitionCandidate(node, Boolean(match.groups.bracketLabel))) {
    return null;
  }
  return {
    anchorIds: collectNodeIds(node),
    backlinkIds: collectHrefFragments(node),
    label,
    markdown: `^[${label}] ${note}`,
    note
  };
}

export function renderInlineFootnoteReference(node: HtmlElement, definitions: HtmlFootnoteDefinitions) {
  const label = normalizeFootnoteLabel(getNodeText(node));
  const href = getAttribute(node, 'href');
  const hrefFragment = getInternalHrefFragment(href);
  if (!label || !hrefFragment) {
    return null;
  }
  const note =
    definitions.byAnchorId.get(hrefFragment) ??
    lookupFootnoteNoteByBacklink(node, definitions) ??
    (isFootnoteReferenceCandidate(node, hrefFragment) ? definitions.byLabel.get(label) ?? null : null);
  if (!note && !isFootnoteReferenceCandidate(node, hrefFragment)) {
    return null;
  }
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

function isFootnoteDefinitionCandidate(node: HtmlElement, hasBracketLabel: boolean) {
  if (hasBracketLabel || hasFootnoteLikeSignals(node)) {
    return true;
  }
  return Boolean(findLeadingMarkerElement(node)) || collectHrefFragments(node).some((fragment) => isFootnoteFragment(fragment));
}

function lookupFootnoteNoteByBacklink(node: HtmlElement, definitions: HtmlFootnoteDefinitions) {
  const nodeId = normalizeFragment(getAttribute(node, 'id'));
  return nodeId ? definitions.byBacklinkId.get(nodeId) ?? null : null;
}

function isFootnoteReferenceCandidate(node: HtmlElement, hrefFragment: string) {
  return hasFootnoteLikeSignals(node) || isFootnoteFragment(hrefFragment);
}

function hasFootnoteLikeSignals(node: HtmlElement) {
  const attributeValues = node.attrs.flatMap((attribute) => [attribute.name, attribute.value]);
  return attributeValues.some((value) => FOOTNOTE_ATTRIBUTE_PATTERN.test(value));
}

function findLeadingMarkerElement(node: HtmlElement) {
  for (const child of node.childNodes) {
    if (child.nodeName === '#text') {
      const text = 'value' in child ? child.value.trim() : '';
      if (!text) {
        continue;
      }
      return null;
    }
    if (!('tagName' in child)) {
      continue;
    }
    return normalizeFootnoteLabel(getNodeText(child)) ? child : null;
  }
  return null;
}

function collectNodeIds(node: HtmlElement) {
  const ids = new Set<string>();
  walkNodes([node], (currentNode) => {
    if (!('tagName' in currentNode)) {
      return;
    }
    const id = normalizeFragment(getAttribute(currentNode, 'id'));
    if (id) {
      ids.add(id);
    }
  });
  return [...ids];
}

function collectHrefFragments(node: HtmlElement) {
  const fragments = new Set<string>();
  walkNodes([node], (currentNode) => {
    if (!('tagName' in currentNode)) {
      return;
    }
    const fragment = getInternalHrefFragment(getAttribute(currentNode, 'href'));
    if (fragment) {
      fragments.add(fragment);
    }
  });
  return [...fragments];
}

function getInternalHrefFragment(href: string | null) {
  if (!href || /^[a-z]+:/i.test(href) || !href.includes('#')) {
    return null;
  }
  const fragment = href.slice(href.lastIndexOf('#') + 1);
  return normalizeFragment(fragment);
}

function normalizeFragment(fragment: string | null) {
  const normalized = fragment?.trim().replace(/^#+/, '');
  return normalized ? normalized : null;
}

function isFootnoteFragment(fragment: string) {
  return FOOTNOTE_FRAGMENT_PATTERN.test(fragment) || FOOTNOTE_REFERENCE_FRAGMENT_PATTERN.test(fragment);
}

function escapeFootnoteText(note: string) {
  return note.replace(/\\/g, '\\\\').replace(/}/g, '\\}');
}
