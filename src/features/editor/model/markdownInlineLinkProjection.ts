import { folioleMarkdownParser } from './folioleMarkdownParser';
import type { MarkdownInlineLinkRange } from './markdownInlineProjectionTypes';
import {
  normalizeMarkdownLinkReferenceLabel,
  type MarkdownSyntaxTree,
  type MarkdownLinkReferenceMap
} from './markdownLinkReferences';
import {
  collectMarkdownEscapedRanges,
  isSafeMarkdownLinkHref,
  normalizeMarkdownLinkDestination,
  projectMarkdownEscapedText
} from './markdownLinkSafety';

type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

function collectChildNodes(node: MarkdownSyntaxNode, names: ReadonlySet<string>) {
  const nodes: MarkdownSyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (names.has(child.name)) nodes.push(child);
  }
  return nodes;
}

function createDirectLinkRange(args: {
  node: MarkdownSyntaxNode;
  offset: number;
  source: string;
}): MarkdownInlineLinkRange | null {
  const marks = collectChildNodes(args.node, new Set(['LinkMark']));
  const url = collectChildNodes(args.node, new Set(['URL']))[0];
  const openingBracket = marks[0];
  const closingBracket = marks[1];
  if (!openingBracket || !closingBracket || !url) return null;
  const labelFrom = args.offset + openingBracket.to;
  const labelTo = args.offset + closingBracket.from;
  const labelSource = args.source.slice(openingBracket.to, closingBracket.from);
  const labelText = projectMarkdownEscapedText(labelSource);
  const hiddenRanges = [
    ...marks,
    url,
    ...collectMarkdownEscapedRanges(labelSource, openingBracket.to)
  ].map((range) => ({ from: args.offset + range.from, to: args.offset + range.to }));
  const href = normalizeMarkdownLinkDestination(args.source.slice(url.from, url.to));
  return {
    from: args.offset + args.node.from,
    hiddenRanges,
    href,
    labelFrom,
    labelText,
    labelTo,
    safe: isSafeMarkdownLinkHref(href),
    to: args.offset + args.node.to
  };
}

function createReferenceLinkRange(args: {
  node: MarkdownSyntaxNode;
  offset: number;
  references: MarkdownLinkReferenceMap;
  source: string;
}): MarkdownInlineLinkRange | null {
  const marks = collectChildNodes(args.node, new Set(['LinkMark']));
  const label = collectChildNodes(args.node, new Set(['LinkLabel']))[0];
  const openingBracket = marks[0];
  const closingBracket = marks[1];
  if (!openingBracket || !closingBracket) return null;
  const labelText = args.source.slice(openingBracket.to, closingBracket.from);
  const rawReferenceLabel = label ? args.source.slice(label.from, label.to) : labelText;
  const normalizedLabel = normalizeMarkdownLinkReferenceLabel(rawReferenceLabel) || normalizeMarkdownLinkReferenceLabel(labelText);
  const href = args.references.get(normalizedLabel);
  if (!href) return null;
  const labelFrom = args.offset + openingBracket.to;
  const labelTo = args.offset + closingBracket.from;
  const projectedLabelText = projectMarkdownEscapedText(labelText);
  const hiddenRanges = [
    ...marks,
    ...(label ? [label] : []),
    ...collectMarkdownEscapedRanges(labelText, openingBracket.to)
  ].map((range) => ({
    from: args.offset + range.from,
    to: args.offset + range.to
  }));
  return {
    from: args.offset + args.node.from,
    hiddenRanges,
    href,
    labelFrom,
    labelText: projectedLabelText,
    labelTo,
    safe: isSafeMarkdownLinkHref(href),
    to: args.offset + args.node.to
  };
}

function visitLinkRanges(args: {
  links: MarkdownInlineLinkRange[];
  node: MarkdownSyntaxNode;
  offset: number;
  references: MarkdownLinkReferenceMap;
  source: string;
}) {
  if (args.node.name === 'Link') {
    const range = createDirectLinkRange(args) ?? createReferenceLinkRange(args);
    if (range) {
      args.links.push({
        ...range,
        hiddenRanges: range.hiddenRanges.sort((left, right) => left.from - right.from)
      });
    }
    return;
  }
  if (args.node.name === 'Image') return;

  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitLinkRanges({ ...args, node: child });
  }
}

function collectParsedMarkdownInlineLinkRangesFromTree(args: {
  offset: number;
  references: MarkdownLinkReferenceMap;
  text: string;
  tree: MarkdownSyntaxTree;
}) {
  const links: MarkdownInlineLinkRange[] = [];
  visitLinkRanges({ links, node: args.tree.topNode, offset: args.offset, references: args.references, source: args.text });
  return links.sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));
}

function collectParsedMarkdownInlineLinkRanges(args: {
  offset: number;
  references: MarkdownLinkReferenceMap;
  text: string;
}) {
  return collectParsedMarkdownInlineLinkRangesFromTree({
    ...args,
    tree: folioleMarkdownParser.parse(args.text)
  });
}

function collectIndentedListItemLinkRanges(args: {
  offset: number;
  references: MarkdownLinkReferenceMap;
  text: string;
}) {
  const listItem = /^(?:[ \t]+)(?:[-+*]|\d{1,9}[.)])[ \t]+/.exec(args.text);
  if (!listItem) return [];
  const contentFrom = listItem[0].length;
  const content = args.text.slice(contentFrom);
  return collectParsedMarkdownInlineLinkRanges({
    offset: args.offset + contentFrom,
    references: args.references,
    text: content
  });
}

export function collectMarkdownInlineLinkRanges(
  text: string,
  offset = 0,
  references: MarkdownLinkReferenceMap = new Map()
): MarkdownInlineLinkRange[] {
  const parsedLinks = collectParsedMarkdownInlineLinkRanges({ offset, references, text });
  return parsedLinks.length > 0
    ? parsedLinks
    : collectIndentedListItemLinkRanges({ offset, references, text });
}

export function collectMarkdownInlineLinkRangesFromTree(
  tree: MarkdownSyntaxTree,
  text: string,
  offset = 0,
  references: MarkdownLinkReferenceMap = new Map()
): MarkdownInlineLinkRange[] {
  const parsedLinks = collectParsedMarkdownInlineLinkRangesFromTree({ offset, references, text, tree });
  return parsedLinks.length > 0
    ? parsedLinks
    : collectIndentedListItemLinkRanges({ offset, references, text });
}
