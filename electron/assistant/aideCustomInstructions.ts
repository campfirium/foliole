import { NATIVE_ASSISTANT_CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '../../lib/platform/nativeAssistantModelSettingsContract.js';

/** Keeps the user's own words apart from product rules so they cannot override them. */
export function formatAideCustomInstructions(text: string | undefined) {
  const value = normalizeAideCustomInstructions(text ?? '');
  if (!value) return '';
  return [
    'User custom instructions (written by the user in Aide settings; follow them unless they conflict with the rules above):',
    value
  ].join('\n');
}

export function appendAideCustomInstructions(base: string, text: string | undefined) {
  const section = formatAideCustomInstructions(text);
  if (!section) return base;
  return `${base.replace(/\n*$/u, '')}\n\n${section}\n`;
}

export function normalizeAideCustomInstructions(text: string) {
  return text.trim().slice(0, NATIVE_ASSISTANT_CUSTOM_INSTRUCTIONS_MAX_LENGTH);
}
