import { type WorkspaceSurfaceAutoPaletteMode, type WorkspaceSurfaceAutoPaletteOptions } from './workspaceSurfaceAutoPalette';
import {
  formatWorkspaceSurfaceColorCss,
  parseWorkspaceSurfaceColor,
  type WorkspaceSurfaceColorValue
} from './workspaceSurfaceColor';

export type WorkspaceSurfaceRecommendationFamily = {
  groupId: 'default' | 'recommended';
  id: string;
  tones: WorkspaceSurfaceColorValue[];
};

type WorkspaceSurfaceRecommendationDefinition = {
  groupId: 'default' | 'recommended';
  id: string;
  tones: readonly string[];
  whiteDocumentTones: readonly string[];
};

function parseRecommendationTone(value: string, alpha: number) {
  const parsed = parseWorkspaceSurfaceColor(value);
  if (!parsed) {
    throw new Error(`Invalid workspace surface recommendation tone: ${value}`);
  }
  return { ...parsed, a: alpha };
}

function applyRecommendationPreferences(
  family: WorkspaceSurfaceRecommendationDefinition,
  alpha: number,
  options: WorkspaceSurfaceAutoPaletteOptions
) {
  const sourceTones = options.documentPureWhite ? family.whiteDocumentTones : family.tones;
  const nextTones = sourceTones.map((tone) => parseRecommendationTone(tone, alpha));
  if (options.folderTopicSharedTone) {
    nextTones[2] = { ...(nextTones[1] ?? nextTones[0] ?? parseRecommendationTone('#ffffff', alpha)) };
  }
  return nextTones;
}

export const WORKSPACE_SURFACE_RECOMMENDATION_COLLECTIONS: readonly WorkspaceSurfaceRecommendationDefinition[] = [
  {
    groupId: 'default',
    id: 'default-graphite-paper',
    tones: ['#7a7a7a', '#d0d0d0', '#e5e5e5', '#f3f3f3', '#c0c0c0'],
    whiteDocumentTones: ['#8a8a8a', '#dbdbdb', '#ededed', '#ffffff', '#cccccc']
  },
  {
    groupId: 'recommended',
    id: 'rec-sage-canvas',
    tones: ['#76826f', '#c7d0c1', '#e1e6db', '#f2f0e7', '#b8c0b2'],
    whiteDocumentTones: ['#85917e', '#d4dbce', '#e8ece3', '#ffffff', '#c8d0c2']
  },
  {
    groupId: 'recommended',
    id: 'rec-warm-beige',
    tones: ['#a78c70', '#dac8b7', '#ece0d2', '#f6eee4', '#cdbba9'],
    whiteDocumentTones: ['#b39a7e', '#e4d4c4', '#f2e8dd', '#ffffff', '#d9c8b7']
  },
  {
    groupId: 'recommended',
    id: 'rec-terracotta-fresco',
    tones: ['#af6f61', '#dcb8ae', '#ecd6cf', '#f5e8e3', '#cfaca4'],
    whiteDocumentTones: ['#bc7f72', '#e5c6be', '#f1ddd7', '#ffffff', '#dbc0b9']
  },
  {
    groupId: 'recommended',
    id: 'rec-amber-ledger',
    tones: ['#a4864e', '#d8c3a1', '#ebdec3', '#f7efdf', '#cab48d'],
    whiteDocumentTones: ['#b2925d', '#e2cfb0', '#f1e6d0', '#ffffff', '#d6c19b']
  },
  {
    groupId: 'recommended',
    id: 'rec-olive-ledger',
    tones: ['#8b8b60', '#cdccb2', '#e3e1ce', '#f2f0e2', '#bfbea1'],
    whiteDocumentTones: ['#99996f', '#d9d8bf', '#eae7d7', '#ffffff', '#ceccb0']
  },
  {
    groupId: 'recommended',
    id: 'rec-teal-atlas',
    tones: ['#5f8e8d', '#b6d1cf', '#d4e7e3', '#edf5f2', '#a4c1be'],
    whiteDocumentTones: ['#6f9d9d', '#c4dcda', '#e0eeeb', '#ffffff', '#b5cecb']
  },
  {
    groupId: 'recommended',
    id: 'rec-blue-harbor',
    tones: ['#6a88a8', '#bfd0e0', '#dae5ee', '#eef3f7', '#aebfd0'],
    whiteDocumentTones: ['#7b98b7', '#ccdbe7', '#e4edf3', '#ffffff', '#becddb']
  },
  {
    groupId: 'recommended',
    id: 'rec-indigo-evening',
    tones: ['#767fa8', '#c3c8e0', '#dde0ef', '#eff1f7', '#b3b8d3'],
    whiteDocumentTones: ['#858fc0', '#d0d4e8', '#e6e8f3', '#ffffff', '#c4c8dd']
  },
  {
    groupId: 'recommended',
    id: 'rec-plum-study',
    tones: ['#8a7697', '#cdc2d5', '#e4dce8', '#f2edf4', '#beb3c7'],
    whiteDocumentTones: ['#9984a6', '#d9d0de', '#ebe5ee', '#ffffff', '#ccc3d2']
  },
  {
    groupId: 'recommended',
    id: 'rec-rose-fresco',
    tones: ['#a47782', '#d8c0c7', '#eadbe0', '#f6eef1', '#c9b0b7'],
    whiteDocumentTones: ['#b28691', '#e1cdd3', '#f0e3e7', '#ffffff', '#d7c1c7']
  }
] as const;

const WORKSPACE_SURFACE_DARK_RECOMMENDATION_COLLECTIONS: readonly WorkspaceSurfaceRecommendationDefinition[] = [
  {
    groupId: 'default',
    id: 'dark-default-graphite',
    tones: ['#171b1a', '#1a1f1e', '#1c2221', '#161918', '#1a1f1e'],
    whiteDocumentTones: ['#171b1a', '#1a1f1e', '#1c2221', '#161918', '#1a1f1e']
  },
  {
    groupId: 'recommended',
    id: 'dark-rec-sage-canvas',
    tones: ['#1d241f', '#252d27', '#2d372f', '#151916', '#354037'],
    whiteDocumentTones: ['#1d241f', '#252d27', '#2d372f', '#151916', '#354037']
  },
  {
    groupId: 'recommended',
    id: 'dark-rec-pine-atlas',
    tones: ['#182622', '#21322d', '#293d37', '#121916', '#314941'],
    whiteDocumentTones: ['#182622', '#21322d', '#293d37', '#121916', '#314941']
  },
  {
    groupId: 'recommended',
    id: 'dark-rec-blue-harbor',
    tones: ['#1b2330', '#253044', '#2d3a52', '#131722', '#354561'],
    whiteDocumentTones: ['#1b2330', '#253044', '#2d3a52', '#131722', '#354561']
  },
  {
    groupId: 'recommended',
    id: 'dark-rec-indigo-evening',
    tones: ['#202132', '#2b2d46', '#343756', '#171722', '#3d4065'],
    whiteDocumentTones: ['#202132', '#2b2d46', '#343756', '#171722', '#3d4065']
  },
  {
    groupId: 'recommended',
    id: 'dark-rec-sepia-ledger',
    tones: ['#29231c', '#362e25', '#41382d', '#1c1712', '#4e4235'],
    whiteDocumentTones: ['#29231c', '#362e25', '#41382d', '#1c1712', '#4e4235']
  }
] as const;

function getRecommendationCollections(mode: WorkspaceSurfaceAutoPaletteMode) {
  return mode === 'dark'
    ? WORKSPACE_SURFACE_DARK_RECOMMENDATION_COLLECTIONS
    : WORKSPACE_SURFACE_RECOMMENDATION_COLLECTIONS;
}

export function getWorkspaceSurfaceRecommendationFamilies(
  color: WorkspaceSurfaceColorValue,
  options: WorkspaceSurfaceAutoPaletteOptions,
  mode: WorkspaceSurfaceAutoPaletteMode = 'light'
): WorkspaceSurfaceRecommendationFamily[] {
  return getRecommendationCollections(mode).map((family) => ({
    groupId: family.groupId,
    id: family.id,
    tones: applyRecommendationPreferences(family, color.a, options)
  }));
}

export function getWorkspaceSurfaceRecommendationPaletteCss(
  familyId: string,
  alpha: number,
  options: WorkspaceSurfaceAutoPaletteOptions,
  mode: WorkspaceSurfaceAutoPaletteMode = 'light'
) {
  const family = getRecommendationCollections(mode).find((entry) => entry.id === familyId);
  if (!family) {
    return null;
  }
  return applyRecommendationPreferences(family, alpha, options)
    .map((tone) => formatWorkspaceSurfaceColorCss(tone));
}
