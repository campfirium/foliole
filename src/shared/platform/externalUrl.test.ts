import { expect, it } from 'vitest';

import { normalizeOpenExternalUrl } from '../../../lib/platform/externalUrl';

it('allows web and email external URLs', () => {
  expect(normalizeOpenExternalUrl('https://example.com/docs')).toBe('https://example.com/docs');
  expect(normalizeOpenExternalUrl('mailto:hello@foliole.app')).toBe('mailto:hello@foliole.app');
});

it('rejects unsafe external URL protocols', () => {
  expect(normalizeOpenExternalUrl('javascript:alert(1)')).toBeNull();
  expect(normalizeOpenExternalUrl('file:///tmp/source.md')).toBeNull();
});
