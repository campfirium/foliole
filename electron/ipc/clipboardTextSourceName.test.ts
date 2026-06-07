import { expect, it } from 'vitest';

import { resolveClipboardTextSourceName } from './clipboardTextSourceName.js';

it('uses readable clipboard content instead of a technical clipboard format name', () => {
  expect(resolveClipboardTextSourceName('# Clipboard topic\n\nBody')).toBe('Clipboard topic Body');
});

it('truncates long clipboard source names by character count', () => {
  expect(resolveClipboardTextSourceName('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 1234567890')).toBe(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV...'
  );
});

it('falls back when clipboard text has no readable preview', () => {
  expect(resolveClipboardTextSourceName('***\n\n> |')).toBe('Clipboard import');
});
