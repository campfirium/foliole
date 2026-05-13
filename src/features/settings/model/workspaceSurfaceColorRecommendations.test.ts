import { expect, it } from 'vitest';

import { formatWorkspaceSurfaceColorCss, parseWorkspaceSurfaceColor } from './workspaceSurfaceColor';
import {
  getWorkspaceSurfaceRecommendationFamilies,
  getWorkspaceSurfaceRecommendationPaletteCss,
  WORKSPACE_SURFACE_RECOMMENDATION_COLLECTIONS
} from './workspaceSurfaceColorRecommendations';

const DEFAULT_OPTIONS = {
  documentPureWhite: false,
  folderTopicSharedTone: false
};

it('returns one gray default palette and a deduped recommended palette set', () => {
  const source = parseWorkspaceSurfaceColor('#8a962f');

  expect(source).not.toBeNull();
  const families = getWorkspaceSurfaceRecommendationFamilies(source!, DEFAULT_OPTIONS);

  expect(families.map((family) => family.id)).toEqual(
    WORKSPACE_SURFACE_RECOMMENDATION_COLLECTIONS.map((family) => family.id)
  );
  expect(families.filter((family) => family.groupId === 'default')).toHaveLength(1);
  expect(families.filter((family) => family.groupId === 'recommended')).toHaveLength(10);
  expect(families.every((family) => family.tones.length === 5)).toBe(true);
});

it('preserves the current alpha across fixed palette families', () => {
  const source = parseWorkspaceSurfaceColor('#f5f5f380');

  expect(source).not.toBeNull();
  const families = getWorkspaceSurfaceRecommendationFamilies(source!, DEFAULT_OPTIONS);

  expect(formatWorkspaceSurfaceColorCss(families[0]!.tones[0]!).endsWith('80')).toBe(true);
  expect(formatWorkspaceSurfaceColorCss(families[10]!.tones[4]!).endsWith('80')).toBe(true);
});

it('uses a visibly different white-document variant for fixed palettes', () => {
  const tintedPalette = getWorkspaceSurfaceRecommendationPaletteCss('default-graphite-paper', 1, DEFAULT_OPTIONS);
  const whitePalette = getWorkspaceSurfaceRecommendationPaletteCss('default-graphite-paper', 1, {
    documentPureWhite: true,
    folderTopicSharedTone: false
  });

  expect(tintedPalette).toEqual([
    '#7a7a7a',
    '#d0d0d0',
    '#e5e5e5',
    '#f3f3f3',
    '#c0c0c0'
  ]);
  expect(whitePalette).toEqual([
    '#8a8a8a',
    '#dbdbdb',
    '#ededed',
    '#ffffff',
    '#cccccc'
  ]);
});

it('keeps the graphite default palette close to a true gray baseline', () => {
  const source = parseWorkspaceSurfaceColor('#8a962f');

  expect(source).not.toBeNull();
  const grayFamily = getWorkspaceSurfaceRecommendationFamilies(source!, DEFAULT_OPTIONS)
    .find((family) => family.id === 'default-graphite-paper');

  expect(grayFamily).toBeDefined();
  const firstTone = grayFamily!.tones[0]!;
  expect(Math.abs(firstTone.r - firstTone.g)).toBeLessThanOrEqual(3);
  expect(Math.abs(firstTone.g - firstTone.b)).toBeLessThanOrEqual(3);
});
