const UNTITLED_NODE_TITLE = 'Untitled';
const TITLE_MAX_LENGTH = 80;

function sanitizeTitleCandidate(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, TITLE_MAX_LENGTH);
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

function extractHeadingTitle(content: string) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.trim().match(/^#\s+(.+)$/);
    if (!match?.[1]) {
      continue;
    }
    const sanitized = sanitizeTitleCandidate(stripMarkdownInline(match[1]));
    if (sanitized) {
      return sanitized;
    }
  }
  return null;
}

function extractFallbackTitle(content: string) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const normalized = sanitizeTitleCandidate(stripMarkdownInline(stripMarkdownPrefixes(line)));
    if (!normalized) {
      continue;
    }

    const stopIndex = normalized.search(/[。！？!?，,.;；:：]/);
    const slice = stopIndex > 0 ? normalized.slice(0, stopIndex) : normalized;
    const candidate = sanitizeTitleCandidate(slice);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

export function deriveNodeTitleFromContent(content: string) {
  return extractHeadingTitle(content) ?? extractFallbackTitle(content) ?? UNTITLED_NODE_TITLE;
}
