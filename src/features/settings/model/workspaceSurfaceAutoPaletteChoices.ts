import { type WorkspaceSurfaceAutoPaletteMode, type WorkspaceSurfaceAutoPaletteOptions } from './workspaceSurfaceAutoPalette';
import {
  formatWorkspaceSurfaceColorCss,
  parseWorkspaceSurfaceColor,
  workspaceSurfaceColorFromHsl,
  workspaceSurfaceColorToHsl
} from './workspaceSurfaceColor';
import {
  type WorkspaceSurfaceManualPaletteDefinition,
  WORKSPACE_SURFACE_DARK_MANUAL_PALETTES,
  WORKSPACE_SURFACE_MANUAL_PALETTES
} from './workspaceSurfaceManualPalettes';

export type WorkspaceSurfaceAutoPaletteChoice = {
  displayHex: string;
  id: string;
  palette: string[];
  seedHex: string;
};

function buildPaletteFromDefinition(
  definition: WorkspaceSurfaceManualPaletteDefinition,
  options: WorkspaceSurfaceAutoPaletteOptions,
  mode: WorkspaceSurfaceAutoPaletteMode
) {
  const source = mode === 'dark' || !options.documentPureWhite ? definition.tones : definition.whiteDocumentTones;
  const palette = [...source];
  if (options.folderTopicSharedTone) {
    palette[2] = palette[1]!;
  }
  return palette;
}

function createChoice(
  definition: WorkspaceSurfaceManualPaletteDefinition,
  options: WorkspaceSurfaceAutoPaletteOptions,
  mode: WorkspaceSurfaceAutoPaletteMode
): WorkspaceSurfaceAutoPaletteChoice {
  const palette = buildPaletteFromDefinition(definition, options, mode);
  return {
    displayHex: palette[0]!,
    id: definition.id,
    palette,
    seedHex: palette[1]!
  };
}

export function getWorkspaceSurfaceAutoPaletteChoices(
  options: WorkspaceSurfaceAutoPaletteOptions,
  mode: WorkspaceSurfaceAutoPaletteMode = 'light'
) {
  const definitions = mode === 'dark' ? WORKSPACE_SURFACE_DARK_MANUAL_PALETTES : WORKSPACE_SURFACE_MANUAL_PALETTES;
  return definitions.map((definition) => createChoice(definition, options, mode));
}

function shuffleArray<T>(input: readonly T[]) {
  const next = [...input];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
  }
  return next;
}

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampDarkPaletteLightness(index: number, lightness: number) {
  const maxBySlot = [13, 14, 15, 12, 16] as const;
  const minBySlot = [11, 12, 13, 11, 14] as const;
  return Math.min(maxBySlot[index] ?? 16, Math.max(minBySlot[index] ?? 11, lightness));
}

function clampDarkPaletteSaturation(index: number, saturation: number) {
  const maxBySlot = [10, 9, 8, 3, 9] as const;
  const minBySlot = [0, 0, 0, 0, 0] as const;
  return Math.min(maxBySlot[index] ?? 9, Math.max(minBySlot[index] ?? 0, saturation));
}

function tuneDarkPalette(palette: string[], index: number) {
  const hueOffset = (index % 2) - 0.5;
  const lightnessOffset = index % 3 === 0 ? 0 : index % 3 === 1 ? -1 : 1;
  const saturationOffset = index % 2 === 0 ? -2 : -1;
  return palette.map((color, colorIndex) => {
    const parsed = parseWorkspaceSurfaceColor(color);
    if (!parsed) {
      return color;
    }
    const hsl = workspaceSurfaceColorToHsl(parsed);
    return formatWorkspaceSurfaceColorCss(workspaceSurfaceColorFromHsl({
      a: parsed.a,
      h: hsl.h + hueOffset,
      l: clampDarkPaletteLightness(
        colorIndex,
        clampPercentage(hsl.l + (colorIndex === 3 ? 0 : lightnessOffset))
      ),
      s: clampDarkPaletteSaturation(colorIndex, clampPercentage(hsl.s + saturationOffset))
    }));
  });
}

export function createRandomWorkspaceSurfacePalettes(
  options: WorkspaceSurfaceAutoPaletteOptions,
  count: number,
  excludePalettes: string[][] = [],
  mode: WorkspaceSurfaceAutoPaletteMode = 'light'
) {
  const excludedSignatures = new Set(excludePalettes.map((palette) => palette.join('|')));
  const definitions = mode === 'dark' ? WORKSPACE_SURFACE_DARK_MANUAL_PALETTES : WORKSPACE_SURFACE_MANUAL_PALETTES;
  const candidates = shuffleArray(getWorkspaceSurfaceAutoPaletteChoices(options, mode));
  const usedFamilies = new Set<string>();
  const next: string[][] = [];

  for (const candidate of candidates) {
    const definition = definitions.find((entry) => entry.id === candidate.id);
    if (!definition || excludedSignatures.has(candidate.palette.join('|'))) {
      continue;
    }
    if (usedFamilies.has(definition.family) && candidates.length > count) {
      continue;
    }
    usedFamilies.add(definition.family);
    next.push(mode === 'dark' ? tuneDarkPalette(candidate.palette, next.length) : candidate.palette);
    if (next.length >= count) {
      return next;
    }
  }

  for (const candidate of candidates) {
    if (excludedSignatures.has(candidate.palette.join('|'))) {
      continue;
    }
    const palette = mode === 'dark' ? tuneDarkPalette(candidate.palette, next.length) : candidate.palette;
    if (next.some((entry) => entry.join('|') === palette.join('|'))) {
      continue;
    }
    next.push(palette);
    if (next.length >= count) {
      break;
    }
  }

  return next;
}
