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
const MARKDOWN_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+(.+)$/;

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

function deriveSplitTopicTitle(content: string) {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(MARKDOWN_HEADING_PATTERN);
    const candidate = match ? sanitizeTitleCandidate(stripMarkdownInline(match[1] ?? '')) : '';
    if (candidate) {
      return candidate;
    }
  }
  for (const line of content.split(/\r?\n/)) {
    const candidate = sanitizeTitleCandidate(stripMarkdownInline(stripMarkdownPrefixes(line)));
    if (candidate) {
      return candidate;
    }
  }
  return UNTITLED_NODE_TITLE;
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
    const prefix = input.keepDelimiter && index > 0 ? input.delimiter : '';
    return [`${prefix}${part}`];
  });
}

export function buildSplitTopicPreview(input: SplitTopicPreviewInput): SplitTopicPreviewPart[] {
  const headerText = input.headerText ?? '';
  const footerText = input.footerText ?? '';
  return splitContent(input).map((part) => {
    const body = appendAffixes(part, headerText, footerText);
    return {
      body,
      title: deriveSplitTopicTitle(body)
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
