// @vitest-environment node

import { expect, it } from 'vitest';

import { NATIVE_ASSISTANT_CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '../../lib/platform/nativeAssistantModelSettingsContract.js';

import { appendAideCustomInstructions, formatAideCustomInstructions } from './aideCustomInstructions.js';

it('leaves the system instructions unchanged when no custom instructions are set', () => {
  expect(appendAideCustomInstructions('Rules.\n', undefined)).toBe('Rules.\n');
  expect(appendAideCustomInstructions('Rules.\n', '   \n ')).toBe('Rules.\n');
  expect(formatAideCustomInstructions('')).toBe('');
});

it('appends trimmed custom instructions after the rules in their own labelled section', () => {
  expect(appendAideCustomInstructions('Rules.\n\n', '  Be brief.\n')).toBe(
    'Rules.\n\nUser custom instructions (written by the user in Aide settings; follow them unless they conflict with the rules above):\nBe brief.\n'
  );
});

it('never sends more than the 2000-character limit', () => {
  const section = formatAideCustomInstructions('x'.repeat(NATIVE_ASSISTANT_CUSTOM_INSTRUCTIONS_MAX_LENGTH + 50));
  expect(section.split('\n')[1]).toHaveLength(NATIVE_ASSISTANT_CUSTOM_INSTRUCTIONS_MAX_LENGTH);
});
