import { normalizeNodeTitle } from './nodeTitleBudget.js';

export interface SplitTopicPreviewInput {
  content: string;
  delimiter: string;
  keepDelimiter: boolean;
  headerText?: string;
  footerText?: string;
}

export interface SplitTopicPreviewPart {
  body: string;
  title: string;
}

export interface SplitTopicSourceRange {
  from: number;
  to: number;
}

export interface SplitTopicSourceMap extends SplitTopicSourceRange {
  /** Length of the shared header text placed before the part. */
  prefixLength: number;
  removed: SplitTopicSourceRange[];
}

export interface SplitTopicPart extends SplitTopicPreviewPart {
  sourceMap: SplitTopicSourceMap;
}

export interface SplitTopicOrderInput {
  generatedNodeIds: string[];
  nodeOrder: string[];
  sourceNodeId: string;
}

const UNTITLED_NODE_TITLE = 'Untitled';
const MARKDOWN_HEADING_PATTERN = /^( {0,3})(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/;
const MARKDOWN_FENCE_PATTERN = /^( {0,3})(`{3,}|~{3,})(.*)$/;

function sanitizeTitleCandidate(value: string) {
  return normalizeNodeTitle(value.trim().replace(/\s+/g, ' '));
}

function stripMarkdownPrefixes(value: string) {
  return value
    .trim()
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#{1,6}\s+/, '');
}

function stripMarkdownInline(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]+/g, '');
}

function visitMarkdownLines(content: string, visit: (line: string, heading: RegExpMatchArray | null, excluded: boolean) => void) {
  let fence: { character: string; length: number } | null = null;
  for (const line of content.split(/(?<=\n)/)) {
    const text = line.replace(/\r?\n$/, '');
    const fenceMatch = text.match(MARKDOWN_FENCE_PATTERN);
    if (fenceMatch) {
      const marker = fenceMatch[2]!;
      if (!fence) fence = { character: marker[0]!, length: marker.length };
      else if (marker[0] === fence.character && marker.length >= fence.length && fenceMatch[3]!.trim() === '') fence = null;
      visit(line, null, true);
      continue;
    }
    visit(line, fence ? null : text.match(MARKDOWN_HEADING_PATTERN), fence !== null);
  }
}

function headingTitle(match: RegExpMatchArray) {
  return sanitizeTitleCandidate(stripMarkdownInline((match[3] ?? '').replace(/[ \t]+#+[ \t]*$/, '')));
}

function deriveSplitTopicTitle(content: string) {
  let h1Title = '';
  visitMarkdownLines(content, (_line, heading) => {
    if (!h1Title && heading?.[2]?.length === 1) h1Title = headingTitle(heading);
  });
  if (h1Title) return h1Title;
  let fallback = '';
  visitMarkdownLines(content, (line, _heading, excluded) => {
    if (!fallback && !excluded) fallback = sanitizeTitleCandidate(stripMarkdownInline(stripMarkdownPrefixes(line)));
  });
  if (fallback) return fallback;
  return UNTITLED_NODE_TITLE;
}

interface PromotedContent {
  content: string;
  /** Part-local source ranges dropped by heading promotion, in ascending order. */
  removed: SplitTopicSourceRange[];
}

function promoteMarkdownHeadings(content: string): PromotedContent {
  let shallowest = 7;
  visitMarkdownLines(content, (_line, heading) => {
    if (heading) shallowest = Math.min(shallowest, heading[2]!.length);
  });
  if (shallowest === 7 || shallowest === 1) return { content, removed: [] };
  const offset = shallowest - 1;
  const promoted: string[] = [];
  const removed: SplitTopicSourceRange[] = [];
  let cursor = 0;
  visitMarkdownLines(content, (line, heading) => {
    if (!heading) promoted.push(line);
    else {
      const markerStart = heading[1]!.length;
      promoted.push(`${heading[1]}${'#'.repeat(heading[2]!.length - offset)}${line.slice(markerStart + heading[2]!.length)}`);
      removed.push({ from: cursor + markerStart, to: cursor + markerStart + offset });
    }
    cursor += line.length;
  });
  return { content: promoted.join(''), removed };
}

function appendAffixes(body: string, headerText: string, footerText: string) {
  return `${headerText}${body}${footerText}`;
}

function splitContent(input: SplitTopicPreviewInput) {
  if (input.delimiter.length === 0) {
    throw new Error('split topic delimiter is required');
  }
  const rawParts = input.content.split(input.delimiter);
  if (rawParts.length < 2) {
    return [];
  }
  let cursor = 0;
  return rawParts.flatMap((part, index) => {
    const from = cursor;
    cursor += part.length + input.delimiter.length;
    if (part.trim().length === 0) {
      return [];
    }
    const suffix = input.keepDelimiter && index < rawParts.length - 1 ? input.delimiter : '';
    const text = `${part}${suffix}`;
    return [{ from, text }];
  });
}

/**
 * Builds split parts together with the mapping from each part's source span to its generated body,
 * so anchored highlights on the source can follow the text they mark.
 */
export function buildSplitTopicParts(input: SplitTopicPreviewInput): SplitTopicPart[] {
  const headerText = input.headerText ?? '';
  const footerText = input.footerText ?? '';
  return splitContent(input).map(({ from, text }) => {
    const promoted = promoteMarkdownHeadings(text);
    return {
      body: appendAffixes(promoted.content, headerText, footerText),
      title: deriveSplitTopicTitle(promoted.content),
      sourceMap: { from, to: from + text.length, prefixLength: headerText.length, removed: promoted.removed }
    };
  });
}

export function buildSplitTopicPreview(input: SplitTopicPreviewInput): SplitTopicPreviewPart[] {
  return buildSplitTopicParts(input).map(({ body, title }) => ({ body, title }));
}

function mapLocalOffset(map: SplitTopicSourceMap, local: number) {
  let dropped = 0;
  for (const range of map.removed) {
    if (range.from >= local) break;
    dropped += Math.min(range.to, local) - range.from;
  }
  return map.prefixLength + local - dropped;
}

/** Maps a source text range into a generated part body, or null when the range is not fully inside the part. */
export function mapSplitTopicSourceRange(map: SplitTopicSourceMap, range: SplitTopicSourceRange): SplitTopicSourceRange | null {
  if (range.from < map.from || range.to > map.to || range.from > range.to) return null;
  return { from: mapLocalOffset(map, range.from - map.from), to: mapLocalOffset(map, range.to - map.from) };
}

export function buildSplitTopicNodeOrder(input: SplitTopicOrderInput) {
  const sourceIndex = input.nodeOrder.indexOf(input.sourceNodeId);
  if (sourceIndex < 0) {
    throw new Error('split topic source node is missing from node order');
  }
  const withoutGenerated = input.nodeOrder.filter((nodeId) => !input.generatedNodeIds.includes(nodeId));
  const insertIndex = withoutGenerated.indexOf(input.sourceNodeId) + 1;
  return [
    ...withoutGenerated.slice(0, insertIndex),
    ...input.generatedNodeIds,
    ...withoutGenerated.slice(insertIndex)
  ];
}
