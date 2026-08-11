import { afterEach, describe, expect, it } from 'vitest';

import { getRuntimeSystemLanguage } from './runtimeConfig';

afterEach(() => {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
});

describe('runtime system language config', () => {
  it('distinguishes a non-Electron surface from an Electron host without a language', () => {
    expect(getRuntimeSystemLanguage()).toBeUndefined();

    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {} });
    expect(getRuntimeSystemLanguage()).toBeNull();
  });

  it('reads the host-provided first system language', () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { runtimeConfig: { guidedSampleLocale: null, systemLanguage: 'zh-Hans-CN' } }
    });

    expect(getRuntimeSystemLanguage()).toBe('zh-Hans-CN');
  });
});
