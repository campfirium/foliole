// @vitest-environment node
import { expect, it } from 'vitest';

import { createStartupSkeletonLayoutFromSettings } from './startupSkeletonLayout.js';

it('follows the system dark mode when no base color preference is saved', () => {
  expect(createStartupSkeletonLayoutFromSettings({}, { systemColorMode: 'dark' }).mode).toBe('dark');
});

it('preserves an explicitly saved light mode when the system is dark', () => {
  expect(createStartupSkeletonLayoutFromSettings(
    { 'foliole-base-color': 'light' },
    { systemColorMode: 'dark' }
  ).mode).toBe('light');
});

it('follows the system for an invalid saved base color preference', () => {
  expect(createStartupSkeletonLayoutFromSettings(
    { 'foliole-base-color': 'invalid' },
    { systemColorMode: 'dark' }
  ).mode).toBe('dark');
});
