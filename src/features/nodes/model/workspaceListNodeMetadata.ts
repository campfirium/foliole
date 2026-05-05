import type { Node } from './nodeTypes';

const FRONTMATTER_DELIMITER_PATTERN = /^\s*---\s*$/;
const FRONTMATTER_KEY_VALUE_PATTERN = /^([^:#\s][^:]*?)(\s*:\s*)(.*)$/;
const FRONTMATTER_LIST_ITEM_PATTERN = /^(\s*)-\s+(.*)$/;
const WIKILINK_WRAPPER_PATTERN = /\[\[([^\]]+)\]\]/g;
const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)(?:\s+id="[^"]+")?\s*>/g;

export const WORKSPACE_LIST_SUMMARY_FALLBACK = 'No summary yet.';
export const WORKSPACE_LIST_DATE_FALLBACK = 'Unknown date';

const WORKSPACE_LIST_SUMMARY_MAX_LENGTH = 160;

function normalizeFrontmatterValue(value: string) {
  return value.replace(WIKILINK_WRAPPER_PATTERN, '$1').trim();
}

function getFrontmatterLines(content: string) {
  const lines = content.split('\n');
  if (lines.length < 3 || !FRONTMATTER_DELIMITER_PATTERN.test(lines[0] ?? '')) {
    return [];
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (FRONTMATTER_DELIMITER_PATTERN.test(lines[index] ?? '')) {
      return lines.slice(1, index);
    }
  }

  return [];
}

function stripLeadingFrontmatter(content: string) {
  const lines = content.split('\n');
  if (lines.length < 3 || !FRONTMATTER_DELIMITER_PATTERN.test(lines[0] ?? '')) {
    return content;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (FRONTMATTER_DELIMITER_PATTERN.test(lines[index] ?? '')) {
      return lines.slice(index + 1).join('\n');
    }
  }

  return content;
}

function getFrontmatterEntryValues(content: string, targetKey: string) {
  const lines = getFrontmatterLines(content);
  const values: string[] = [];
  let currentKey = '';

  for (const line of lines) {
    const keyMatch = line.match(FRONTMATTER_KEY_VALUE_PATTERN);
    if (keyMatch) {
      currentKey = keyMatch[1]?.trim().toLocaleLowerCase() ?? '';
      if (currentKey !== targetKey) {
        continue;
      }

      const value = normalizeFrontmatterValue(keyMatch[3] ?? '');
      if (value) {
        values.push(value);
      }
      continue;
    }

    const listMatch = line.match(FRONTMATTER_LIST_ITEM_PATTERN);
    if (!listMatch || currentKey !== targetKey) {
      continue;
    }

    const value = normalizeFrontmatterValue(listMatch[2] ?? '');
    if (value) {
      values.push(value);
    }
  }

  return values;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function stripMarkdownLinePrefix(line: string) {
  return line
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

function normalizePreviewText(content: string) {
  return stripMarkdownInline(
    stripLeadingFrontmatter(content)
      .replace(ANCHOR_TAG_PATTERN, '')
      .split(/\r?\n/)
      .map((line) => stripMarkdownLinePrefix(line))
      .join(' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateSummary(value: string) {
  if (value.length <= WORKSPACE_LIST_SUMMARY_MAX_LENGTH) {
    return value;
  }

  const slicedValue = value.slice(0, WORKSPACE_LIST_SUMMARY_MAX_LENGTH).trimEnd();
  const lastSpaceIndex = slicedValue.lastIndexOf(' ');
  const safeValue = lastSpaceIndex >= 100 ? slicedValue.slice(0, lastSpaceIndex) : slicedValue;

  return `${safeValue.trimEnd()}…`;
}

function stripLeadingTitleEcho(summary: string, normalizedTitle: string) {
  let nextSummary = summary;
  const lowerTitle = normalizedTitle.toLocaleLowerCase();

  while (normalizedTitle && nextSummary.toLocaleLowerCase().startsWith(lowerTitle)) {
    nextSummary = nextSummary.slice(normalizedTitle.length).replace(/^[\s:：,-]+/, '').trim();
  }

  return nextSummary;
}

function resolveWorkspaceListDateTimestamp(node: Pick<Node, 'createdAt' | 'updatedAt'>) {
  const updatedAt = node.updatedAt?.trim();
  if (updatedAt && !Number.isNaN(new Date(updatedAt).getTime())) {
    return updatedAt;
  }

  const createdAt = node.createdAt?.trim();
  if (createdAt && !Number.isNaN(new Date(createdAt).getTime())) {
    return createdAt;
  }

  return null;
}

export function getWorkspaceListNodeAuthor(node: Pick<Node, 'content'>) {
  const authorValues = getFrontmatterEntryValues(node.content, 'author').map(normalizeText).filter(Boolean);
  if (authorValues.length === 0) {
    return null;
  }
  return authorValues.join(', ');
}

export function getWorkspaceListNodeSummary(node: Pick<Node, 'content' | 'title'>) {
  const normalizedContent = normalizePreviewText(node.content);
  if (!normalizedContent) {
    return WORKSPACE_LIST_SUMMARY_FALLBACK;
  }

  const normalizedTitle = normalizeText(node.title);
  const strippedSummary = stripLeadingTitleEcho(normalizedContent, normalizedTitle);
  const summary = strippedSummary || WORKSPACE_LIST_SUMMARY_FALLBACK;

  return truncateSummary(summary);
}

export function getWorkspaceListNodeDateLabel(node: Pick<Node, 'createdAt' | 'updatedAt'>) {
  const timestamp = resolveWorkspaceListDateTimestamp(node);
  if (!timestamp) {
    return WORKSPACE_LIST_DATE_FALLBACK;
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

export function compareWorkspaceListNodeDateDesc(
  left: Pick<Node, 'createdAt' | 'updatedAt'>,
  right: Pick<Node, 'createdAt' | 'updatedAt'>
) {
  const leftTimestamp = resolveWorkspaceListDateTimestamp(left);
  const rightTimestamp = resolveWorkspaceListDateTimestamp(right);
  if (!leftTimestamp && !rightTimestamp) {
    return 0;
  }
  if (!leftTimestamp) {
    return 1;
  }
  if (!rightTimestamp) {
    return -1;
  }
  return rightTimestamp.localeCompare(leftTimestamp);
}
