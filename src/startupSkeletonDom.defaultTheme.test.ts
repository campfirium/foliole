import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { applyStartupSkeletonSettings } from './startupSkeletonDom';

beforeEach(() => {
  document.documentElement.removeAttribute('data-base-color');
  document.documentElement.removeAttribute('data-resolved-base-color');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('applies the system theme when no base color preference is saved', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true } as MediaQueryList)));

  applyStartupSkeletonSettings({});

  expect(document.documentElement.dataset.baseColor).toBe('system');
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
});

it('applies the system theme when the saved preference is invalid', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true } as MediaQueryList)));

  applyStartupSkeletonSettings({ 'foliole-base-color': 'invalid' });

  expect(document.documentElement.dataset.baseColor).toBe('system');
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
});
