import { NODE_TITLE_MAX_CHARS } from '../../../shared/config/nodeTitleConfig';

export const UNTITLED_NODE_TITLE = 'Untitled';
const CLOZE_PLACEHOLDER = '[[...]]';

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
  const normalized = content
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
  const reconstructed = prompt.includes(CLOZE_PLACEHOLDER) ? prompt.replace(CLOZE_PLACEHOLDER, answer) : prompt;
  const reconstructedTitle = deriveNodeTitleFromContent(reconstructed);
  if (reconstructedTitle !== UNTITLED_NODE_TITLE) {
    return reconstructedTitle;
  }

  const answerTitle = deriveNodeTitleFromContent(answer);
  if (answerTitle !== UNTITLED_NODE_TITLE) {
    return answerTitle;
  }

  return deriveNodeTitleFromContent(prompt);
}
