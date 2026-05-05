import {
  buildWorkspaceSurfaceAutoColumnPalette,
  type WorkspaceSurfaceAutoPaletteOptions
} from './workspaceSurfaceAutoPalette';
import {
  parseWorkspaceSurfaceColor,
  type WorkspaceSurfaceColorValue
} from './workspaceSurfaceColor';

export type WorkspaceSurfaceRecommendationFamily = {
  id: string;
  tones: WorkspaceSurfaceColorValue[];
};

export const WORKSPACE_SURFACE_RECOMMENDATION_SEEDS = [
  {
    id: 'sand',
    seed: '#c9b28e'
  },
  {
    id: 'linen',
    seed: '#bcae9d'
  },
  {
    id: 'sage',
    seed: '#9ead7b'
  },
  {
    id: 'olive',
    seed: '#869864'
  },
  {
    id: 'mist',
    seed: '#8ea6b4'
  },
  {
    id: 'slate',
    seed: '#8092a2'
  },
  {
    id: 'rose',
    seed: '#b79b92'
  },
  {
    id: 'cocoa',
    seed: '#ab9884'
  }
] as const;

function parseRecommendationSeed(hex: string, alpha: number) {
  const parsed = parseWorkspaceSurfaceColor(hex);
  if (!parsed) {
    throw new Error(`Invalid workspace surface recommendation seed: ${hex}`);
  }
  return { ...parsed, a: alpha };
}

function parseRecommendationTone(value: string, alpha: number) {
  const parsed = parseWorkspaceSurfaceColor(value);
  if (!parsed) {
    throw new Error(`Invalid workspace surface recommendation tone: ${value}`);
  }
  return { ...parsed, a: alpha };
}

export function getWorkspaceSurfaceRecommendationFamilies(
  color: WorkspaceSurfaceColorValue,
  options: WorkspaceSurfaceAutoPaletteOptions
): WorkspaceSurfaceRecommendationFamily[] {
  return WORKSPACE_SURFACE_RECOMMENDATION_SEEDS.map((family) => ({
    id: family.id,
    tones: buildWorkspaceSurfaceAutoColumnPalette(
      parseRecommendationSeed(family.seed, color.a),
      options
    ).map((tone) => parseRecommendationTone(tone, color.a))
  }));
}
