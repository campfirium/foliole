import { expect, it } from 'vitest';

import { addTag, toCategoryId } from './discoursePublishDialogModel';

it('requires a Discourse category before publishing', () => {
  expect(() => toCategoryId('', 'Choose a category.')).toThrow('Choose a category.');
  expect(toCategoryId('8', 'Choose a category.')).toBe(8);
});

it('toggles tags without duplicating selected values', () => {
  expect(addTag('alpha, beta', 'alpha')).toBe('beta');
  expect(addTag('alpha', 'beta')).toBe('alpha, beta');
});
