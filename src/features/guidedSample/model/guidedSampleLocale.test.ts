import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveGuidedSampleLocale } from './guidedSampleLocale';

describe('resolveGuidedSampleLocale', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses Chinese content only for simplified Chinese language tags', () => {
    expect(resolveGuidedSampleLocale(['zh-CN'])).toBe('zh-CN');
    expect(resolveGuidedSampleLocale(['zh-Hans'])).toBe('zh-CN');
    expect(resolveGuidedSampleLocale(['zh-SG'])).toBe('zh-CN');
  });

  it('uses the explicit runtime override before browser languages', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        runtimeConfig: { guidedSampleLocale: 'en-US' }
      }
    });

    expect(resolveGuidedSampleLocale(['zh-CN'])).toBe('en-US');
  });

  it('keeps traditional and ambiguous Chinese language tags on English content', () => {
    expect(resolveGuidedSampleLocale(['zh-TW'])).toBe('en-US');
    expect(resolveGuidedSampleLocale(['zh-HK'])).toBe('en-US');
    expect(resolveGuidedSampleLocale(['zh-MO'])).toBe('en-US');
    expect(resolveGuidedSampleLocale(['zh'])).toBe('en-US');
  });

  it('does not scan secondary browser languages for Chinese content', () => {
    expect(resolveGuidedSampleLocale(['ko-KR', 'zh-CN'])).toBe('en-US');
  });
});
