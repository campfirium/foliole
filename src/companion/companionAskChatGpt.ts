import { isCompanionNativeHost } from '../shared/platform/companionRuntimeCapabilities';

// Long selections still open; the user can extend the prefilled question in ChatGPT.
const MAX_QUESTION_LENGTH = 1500;

export function chatGptQuestionUrl(text: string): string | null {
  const question = text.replace(/\s+/g, ' ').trim();
  if (!question) return null;
  const clipped = Array.from(question).slice(0, MAX_QUESTION_LENGTH).join('');
  return `https://chatgpt.com/?q=${encodeURIComponent(clipped)}`;
}

// Native shells hand top-level external navigation to the OS, which prefers the installed ChatGPT app.
export function openChatGptQuestion(text: string): boolean {
  const url = chatGptQuestionUrl(text);
  if (!url) return false;
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  if (!isCompanionNativeHost()) link.target = '_blank';
  link.click();
  return true;
}
