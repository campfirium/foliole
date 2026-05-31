import { describe, expect, it } from 'vitest';

import { resolveGuidedSampleLocale } from './guidedSampleLocale';

describe('resolveGuidedSampleLocale', () => {
  it('uses Chinese content only for simplified Chinese language tags', () => {
    expect(resolveGuidedSampleLocale(['zh-CN'])).toBe('zh-CN');
    expect(resolveGuidedSampleLocale(['zh-Hans'])).toBe('zh-CN');
    expect(resolveGuidedSampleLocale(['zh-SG'])).toBe('zh-CN');
  });

  it('keeps traditional and ambiguous Chinese language tags on English content', () => {
    expect(resolveGuidedSampleLocale(['zh-TW'])).toBe('en-US');
    expect(resolveGuidedSampleLocale(['zh-HK'])).toBe('en-US');
    expect(resolveGuidedSampleLocale(['zh-MO'])).toBe('en-US');
    expect(resolveGuidedSampleLocale(['zh'])).toBe('en-US');
  });
});
