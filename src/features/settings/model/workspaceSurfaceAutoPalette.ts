import {
  formatWorkspaceSurfaceColorCss,
  workspaceSurfaceColorFromHsl,
  workspaceSurfaceColorToHsl,
  type WorkspaceSurfaceColorValue
} from './workspaceSurfaceColor';
import { type WorkspaceSurfaceAssignments, type WorkspaceSurfacePalette } from './workspaceSurfaceSettings';

const DEFAULT_COLUMN_LIGHTNESS = [84, 91, 94, 98, 95] as const;
const DEFAULT_COLUMN_SATURATION_FACTORS = [0.58, 0.42, 0.3, 0.12, 0.2] as const;
const WHITE_DOCUMENT_LIGHTNESS = [84, 94, 96, 100, 97] as const;
const WHITE_DOCUMENT_SATURATION_FACTORS = [0.48, 0.22, 0.16, 0, 0.1] as const;

export type WorkspaceSurfaceAutoPaletteOptions = {
  documentPureWhite: boolean;
  folderTopicSharedTone: boolean;
};

export type WorkspaceSurfaceAutoPaletteTuning = {
  saturationRange?: { max: number; min: number };
};

function resolveColumnRecipe(options: WorkspaceSurfaceAutoPaletteOptions) {
  if (options.documentPureWhite) {
    return {
      lightness: WHITE_DOCUMENT_LIGHTNESS,
      saturationFactors: WHITE_DOCUMENT_SATURATION_FACTORS
    };
  }
  return {
    lightness: DEFAULT_COLUMN_LIGHTNESS,
    saturationFactors: DEFAULT_COLUMN_SATURATION_FACTORS
  };
}

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampChannel(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildSafeSeedTone(
  seedColor: WorkspaceSurfaceColorValue,
  tuning?: WorkspaceSurfaceAutoPaletteTuning
) {
  const seedHsl = workspaceSurfaceColorToHsl(seedColor);
  const saturationRange = tuning?.saturationRange ?? { max: 42, min: 18 };
  return {
    a: seedColor.a,
    h: seedHsl.h,
    l: clampChannel(seedHsl.l, 36, 72),
    s: seedHsl.s <= 8 ? 0 : clampChannel(seedHsl.s, saturationRange.min, saturationRange.max)
  };
}

function resolveColumnSaturation(sourceSaturation: number, factor: number) {
  if (sourceSaturation <= 8) {
    return 0;
  }
  return clampPercentage(sourceSaturation * factor);
}

export function buildWorkspaceSurfaceAutoColumnPalette(
  seedColor: WorkspaceSurfaceColorValue,
  options: WorkspaceSurfaceAutoPaletteOptions,
  tuning?: WorkspaceSurfaceAutoPaletteTuning
): WorkspaceSurfacePalette {
  const seedHsl = buildSafeSeedTone(seedColor, tuning);
  const recipe = resolveColumnRecipe(options);
  const palette = recipe.lightness.map((lightness, index) => (
    formatWorkspaceSurfaceColorCss(workspaceSurfaceColorFromHsl({
      a: seedColor.a,
      h: seedHsl.h,
      l: lightness,
      s: resolveColumnSaturation(seedHsl.s, recipe.saturationFactors[index])
    }))
  ));
  if (options.folderTopicSharedTone) {
    palette[2] = palette[1];
  }
  if (options.documentPureWhite) {
    palette[3] = formatWorkspaceSurfaceColorCss({ a: seedColor.a, r: 255, g: 255, b: 255 });
  }
  return palette;
}

export function applyWorkspaceSurfaceAutoPalette(
  currentPalette: WorkspaceSurfacePalette,
  autoPalette: WorkspaceSurfacePalette
) {
  const preservedTail = currentPalette.slice(autoPalette.length);
  return [...autoPalette, ...preservedTail];
}

export function buildWorkspaceSurfaceAutoAssignments(): WorkspaceSurfaceAssignments {
  return {
    'titlebar-rail': 0,
    'titlebar-folder': 1,
    'titlebar-topic': 2,
    'titlebar-document': 3,
    'titlebar-sidebar': 4,
    'main-rail': 0,
    'main-folder': 1,
    'main-topic': 2,
    'main-document': 3,
    'main-sidebar': 4,
    'footer-rail': 0,
    'footer-folder': 1,
    'footer-topic': 2,
    'footer-document': 3,
    'footer-sidebar': 4
  };
}
