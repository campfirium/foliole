import { NODE_TITLE_MAX_CHARS } from '../../../shared/config/nodeTitleConfig';

export const UNTITLED_NODE_TITLE = 'Untitled';
const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)(?:\s+id="[^"]+")?\s*>/g;
const MARKDOWN_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+(.+)$/;
const UNTITLED_NODE_TITLE_PATTERN = /^Untitled(?: (\d+))?$/;

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

function normalizeMarkdownContent(content: string) {
  const noAnchorTags = content.replace(ANCHOR_TAG_PATTERN, '');
  const normalized = noAnchorTags
    .split(/\r?\n/)
    .map((line) => stripMarkdownPrefixes(line))
    .join(' ');
  return stripMarkdownInline(normalized);
}

function pickHeadingTitle(content: string) {
  const noAnchorTags = content.replace(ANCHOR_TAG_PATTERN, '');
  for (const line of noAnchorTags.split(/\r?\n/)) {
    const match = line.match(MARKDOWN_HEADING_PATTERN);
    if (!match) {
      continue;
    }
    const headingText = sanitizeTitleCandidate(stripMarkdownInline(match[1] ?? ''));
    if (headingText) {
      return headingText;
    }
  }
  return '';
}

function parseUntitledSequence(title: string) {
  const match = title.trim().match(UNTITLED_NODE_TITLE_PATTERN);
  if (!match) {
    return null;
  }
  return match[1] ? Number.parseInt(match[1], 10) : 0;
}

export function deriveNodeTitleFromContent(content: string) {
  const headingTitle = pickHeadingTitle(content);
  if (headingTitle) {
    return headingTitle;
  }
  const candidate = sanitizeTitleCandidate(normalizeMarkdownContent(content));
  return candidate || UNTITLED_NODE_TITLE;
}

export function deriveNodeTitleForCloze(promptContent: string, answerContent: string) {
  const prompt = promptContent.trim();
  const answer = answerContent.trim();
  const promptTitle = deriveNodeTitleFromContent(prompt);
  if (promptTitle !== UNTITLED_NODE_TITLE) {
    return promptTitle;
  }

  const answerTitle = deriveNodeTitleFromContent(answer);
  if (answerTitle !== UNTITLED_NODE_TITLE) {
    return answerTitle;
  }

  return deriveNodeTitleFromContent(prompt);
}

export function deriveNextUntitledNodeTitle(titles: string[]) {
  let nextSequence = 0;

  for (const title of titles) {
    const sequence = parseUntitledSequence(title);
    if (sequence === null) {
      continue;
    }
    nextSequence = Math.max(nextSequence, sequence + 1);
  }

  return nextSequence === 0 ? UNTITLED_NODE_TITLE : `${UNTITLED_NODE_TITLE} ${nextSequence}`;
}
