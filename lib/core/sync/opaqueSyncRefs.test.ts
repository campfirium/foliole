import { describe, expect, it } from 'vitest';

import {
  createOpaqueEventRef,
  createOpaqueVersionRef,
  isLegacyEncodedEventRef,
  rewriteReferenceToken,
  rewriteStructuredRefs
} from './opaqueSyncRefs.js';

describe('opaque sync references', () => {
  it('does not encode Host in new references', () => {
    expect(createOpaqueVersionRef('same-random-value')).toBe('ver_same-random-value');
    expect(createOpaqueEventRef('same-random-value')).toBe('evt_same-random-value');
    expect(isLegacyEncodedEventRef('MacBook#review-1')).toBe(true);
    expect(isLegacyEncodedEventRef('evt_review-1')).toBe(false);
  });

  it('rewrites exact structured references without altering user text', () => {
    const refs = new Map([['MacBook#1', 'ver_1']]);
    const value = JSON.stringify({
      current_version_id: 'MacBook#1',
      history: ['MacBook#1'],
      title: 'Notes mentioning MacBook#1 remain text'
    });
    expect(JSON.parse(rewriteStructuredRefs(value, refs))).toEqual({
      current_version_id: 'ver_1',
      history: ['ver_1'],
      title: 'Notes mentioning MacBook#1 remain text'
    });
    expect(rewriteReferenceToken('node:MacBook#1', refs)).toBe('node:ver_1');
  });
});
