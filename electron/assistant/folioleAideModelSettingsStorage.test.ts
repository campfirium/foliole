// @vitest-environment node

import { expect, it } from 'vitest';

import { normalizeAssistantModelEndpoint } from './folioleAideModelSettingsStorage.js';

it('accepts either a known OpenAI base URL or a complete Chat Completions URL', () => {
  expect(normalizeAssistantModelEndpoint('https://openrouter.ai/api/v1'))
    .toBe('https://openrouter.ai/api/v1/chat/completions');
  expect(normalizeAssistantModelEndpoint('https://generativelanguage.googleapis.com/v1beta/openai/'))
    .toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  expect(normalizeAssistantModelEndpoint('https://models.example/v1/chat/completions'))
    .toBe('https://models.example/v1/chat/completions');
});
