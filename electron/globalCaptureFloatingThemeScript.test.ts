// @vitest-environment node

import { expect, it } from 'vitest';

import { buildFloatingThemeReadScript } from './globalCaptureFloatingThemeScript.js';

it('builds a syntactically valid floating theme read script', () => {
  expect(() => new Function(buildFloatingThemeReadScript())).not.toThrow();
});
