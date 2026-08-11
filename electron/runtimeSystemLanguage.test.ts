import { describe, expect, it } from 'vitest';

import {
  publishRuntimeSystemLanguage,
  RUNTIME_SYSTEM_LANGUAGE_ENV_KEY
} from './runtimeSystemLanguage.js';

describe('runtime system language', () => {
  it('publishes only the first host preferred language', () => {
    const env: NodeJS.ProcessEnv = {};

    expect(publishRuntimeSystemLanguage({
      getPreferredSystemLanguages: () => ['zh-Hans-CN', 'en-US']
    }, env)).toBe('zh-Hans-CN');
    expect(env[RUNTIME_SYSTEM_LANGUAGE_ENV_KEY]).toBe('zh-Hans-CN');
  });

  it('publishes an empty value when the host has no preferred language', () => {
    const env: NodeJS.ProcessEnv = {};

    expect(publishRuntimeSystemLanguage({ getPreferredSystemLanguages: () => [] }, env)).toBe('');
    expect(env[RUNTIME_SYSTEM_LANGUAGE_ENV_KEY]).toBe('');
  });
});
