import { NODE_TITLE_MAX_CHARS } from '../../../shared/config/nodeTitleConfig';

export const UNTITLED_NODE_TITLE = 'Untitled';
const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)(?:\s+id="[^"]+")?\s*>/g;

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

export function deriveNodeTitleFromContent(content: string) {
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
