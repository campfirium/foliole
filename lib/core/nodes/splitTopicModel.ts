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

export interface SplitTopicOrderInput {
  generatedNodeIds: string[];
  nodeOrder: string[];
  sourceNodeId: string;
}

const NODE_TITLE_MAX_CHARS = 100;
const UNTITLED_NODE_TITLE = 'Untitled';
const MARKDOWN_HEADING_PATTERN = /^( {0,3})(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/;
const MARKDOWN_FENCE_PATTERN = /^( {0,3})(`{3,}|~{3,})(.*)$/;

function sanitizeTitleCandidate(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, NODE_TITLE_MAX_CHARS);
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

function promoteMarkdownHeadings(content: string) {
  let shallowest = 7;
  visitMarkdownLines(content, (_line, heading) => {
    if (heading) shallowest = Math.min(shallowest, heading[2]!.length);
  });
  if (shallowest === 7 || shallowest === 1) return content;
  const offset = shallowest - 1;
  const promoted: string[] = [];
  visitMarkdownLines(content, (line, heading) => {
    if (!heading) promoted.push(line);
    else promoted.push(`${heading[1]}${'#'.repeat(heading[2]!.length - offset)}${line.slice(heading[1]!.length + heading[2]!.length)}`);
  });
  return promoted.join('');
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
  return rawParts.flatMap((part, index) => {
    if (part.trim().length === 0) {
      return [];
    }
    const suffix = input.keepDelimiter && index < rawParts.length - 1 ? input.delimiter : '';
    return [`${part}${suffix}`];
  });
}

export function buildSplitTopicPreview(input: SplitTopicPreviewInput): SplitTopicPreviewPart[] {
  const headerText = input.headerText ?? '';
  const footerText = input.footerText ?? '';
  return splitContent(input).map((part) => {
    const promotedPart = promoteMarkdownHeadings(part);
    const body = appendAffixes(promotedPart, headerText, footerText);
    return {
      body,
      title: deriveSplitTopicTitle(promotedPart)
    };
  });
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
