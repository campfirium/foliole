import { expect, it } from 'vitest';

import {
  buildWorkspaceSurfaceAutoColumnPalette,
  type WorkspaceSurfaceAutoPaletteOptions
} from './workspaceSurfaceAutoPalette';
import { formatWorkspaceSurfaceColorCss, parseWorkspaceSurfaceColor } from './workspaceSurfaceColor';
import {
  getWorkspaceSurfaceRecommendationFamilies,
  WORKSPACE_SURFACE_RECOMMENDATION_SEEDS
} from './workspaceSurfaceColorRecommendations';

const DEFAULT_OPTIONS: WorkspaceSurfaceAutoPaletteOptions = {
  documentPureWhite: false,
  folderTopicSharedTone: false
};

it('returns curated workspace surface palette families with five tones each', () => {
  const source = parseWorkspaceSurfaceColor('#8a962f');

  expect(source).not.toBeNull();
  const families = getWorkspaceSurfaceRecommendationFamilies(source!, DEFAULT_OPTIONS);

  expect(families.map((family) => family.id)).toEqual(WORKSPACE_SURFACE_RECOMMENDATION_SEEDS.map((family) => family.id));
  expect(families.every((family) => family.tones.length === 5)).toBe(true);
});

it('preserves the current alpha across curated recommendation families', () => {
  const source = parseWorkspaceSurfaceColor('#f5f5f380');

  expect(source).not.toBeNull();
  const families = getWorkspaceSurfaceRecommendationFamilies(source!, DEFAULT_OPTIONS);

  expect(formatWorkspaceSurfaceColorCss(families[0].tones[0]).endsWith('80')).toBe(true);
  expect(formatWorkspaceSurfaceColorCss(families[7].tones[4]).endsWith('80')).toBe(true);
});

it('reshapes recommended families for white document preference', () => {
  const source = parseWorkspaceSurfaceColor('#2a491d');

  expect(source).not.toBeNull();
  const families = getWorkspaceSurfaceRecommendationFamilies(source!, {
    documentPureWhite: true,
    folderTopicSharedTone: true
  });
  const sageSeed = parseWorkspaceSurfaceColor(
    WORKSPACE_SURFACE_RECOMMENDATION_SEEDS.find((family) => family.id === 'sage')!.seed
  );

  expect(sageSeed).not.toBeNull();
  expect(families[2].tones.map((tone) => formatWorkspaceSurfaceColorCss(tone))).toEqual(
    buildWorkspaceSurfaceAutoColumnPalette({ ...sageSeed!, a: source!.a }, {
      documentPureWhite: true,
      folderTopicSharedTone: true
    })
  );
});
