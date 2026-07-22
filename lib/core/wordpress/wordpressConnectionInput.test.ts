import { expect, it } from 'vitest';

import {
  getWordPressSiteIdentity,
  getWordPressSiteKind,
  isWordPressApplicationPasswordValid,
  normalizeWordPressApplicationPassword,
  normalizeWordPressSiteUrl
} from './wordpressConnectionInput.js';

it('accepts WordPress addresses with or without an HTTPS scheme', () => {
  expect(normalizeWordPressSiteUrl('folioleapp.wordpress.com/')).toBe('https://folioleapp.wordpress.com');
  expect(normalizeWordPressSiteUrl('https://example.com/blog/')).toBe('https://example.com/blog');
  expect(() => normalizeWordPressSiteUrl('http://example.com')).toThrow('valid HTTPS');
});

it('classifies bare WordPress.com addresses', () => {
  expect(getWordPressSiteKind('folioleapp.wordpress.com')).toBe('wordpressCom');
  expect(getWordPressSiteKind('example.com')).toBe('selfHosted');
  expect(getWordPressSiteKind('https://')).toBe('unknown');
});

it('removes copied spacing and validates provider-specific password lengths', () => {
  expect(normalizeWordPressApplicationPassword('6myk gez5\nhkyo\tuhij')).toBe('6mykgez5hkyouhij');
  expect(isWordPressApplicationPasswordValid('6myk gez5 hkyo uhij', 'wordpressCom')).toBe(true);
  expect(isWordPressApplicationPasswordValid('abcd efgh ijkl mnop qrst uvwx', 'selfHosted')).toBe(true);
  expect(isWordPressApplicationPasswordValid('6myk gez5 hkyo uhij', 'selfHosted')).toBe(false);
});

it('matches the same returned site identity across HTTP and HTTPS', () => {
  expect(getWordPressSiteIdentity('http://folioleapp.wordpress.com/'))
    .toBe(getWordPressSiteIdentity('https://folioleapp.wordpress.com'));
});
