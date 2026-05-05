import { expect, it } from 'vitest';

import {
  getRuntimeStartupTokensInlineCss,
  getRuntimeStartupTokensThemeSource,
  setRuntimeStartupTokensCss
} from './runtimeStartupTokens.js';

it('keeps the current startup token css for main-process html injection', () => {
  setRuntimeStartupTokensCss('--startup-document-bg:#1f211f;');

  expect(getRuntimeStartupTokensInlineCss()).toBe('--startup-document-bg:#1f211f;');
  expect(getRuntimeStartupTokensThemeSource()).toBe('light');
});

it('keeps the startup theme source for pre-paint document attributes', () => {
  setRuntimeStartupTokensCss('--startup-document-bg:#1f211f;', 'dark');

  expect(getRuntimeStartupTokensThemeSource()).toBe('dark');
});
