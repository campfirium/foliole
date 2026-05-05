import { expect, it } from 'vitest';

import { getRuntimeStartupTokensInlineCss, setRuntimeStartupTokensCss } from './runtimeStartupTokens.js';

it('keeps the current startup token css for main-process html injection', () => {
  setRuntimeStartupTokensCss('--startup-document-bg:#1f211f;');

  expect(getRuntimeStartupTokensInlineCss()).toBe('--startup-document-bg:#1f211f;');
});
