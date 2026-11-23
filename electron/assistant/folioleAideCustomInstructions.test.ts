// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ values: new Map<string, unknown>() }));

vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: (key: string) => store.values.get(key) ?? null,
  saveJsonSetting: (key: string, value: unknown) => { store.values.set(key, value); }
}));

import {
  FOLIOLE_AIDE_CUSTOM_INSTRUCTIONS_KEY,
  loadFolioleAideCustomInstructions,
  saveFolioleAideCustomInstructions
} from './folioleAideCustomInstructions.js';

beforeEach(() => store.values.clear());

it('starts empty and round-trips the saved text', () => {
  expect(loadFolioleAideCustomInstructions()).toEqual({ text: '' });
  expect(saveFolioleAideCustomInstructions('Prefer my excerpts.')).toEqual({ text: 'Prefer my excerpts.' });
  expect(loadFolioleAideCustomInstructions()).toEqual({ text: 'Prefer my excerpts.' });
  expect(store.values.get(FOLIOLE_AIDE_CUSTOM_INSTRUCTIONS_KEY)).toEqual({ text: 'Prefer my excerpts.', version: 1 });
});

it('rejects text over 2000 characters and ignores malformed stored values', () => {
  expect(() => saveFolioleAideCustomInstructions('x'.repeat(2001))).toThrow('invalid_custom_instructions');
  expect(saveFolioleAideCustomInstructions('x'.repeat(2000)).text).toHaveLength(2000);
  store.values.set(FOLIOLE_AIDE_CUSTOM_INSTRUCTIONS_KEY, { text: 42 });
  expect(loadFolioleAideCustomInstructions()).toEqual({ text: '' });
});
