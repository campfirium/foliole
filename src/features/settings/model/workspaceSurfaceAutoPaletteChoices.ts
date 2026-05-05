import { type WorkspaceSurfaceAutoPaletteOptions } from './workspaceSurfaceAutoPalette';
import {
  type WorkspaceSurfaceManualPaletteDefinition,
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
  options: WorkspaceSurfaceAutoPaletteOptions
) {
  const source = options.documentPureWhite ? definition.whiteDocumentTones : definition.tones;
  const palette = [...source];
  if (options.folderTopicSharedTone) {
    palette[2] = palette[1]!;
  }
  return palette;
}

function createChoice(
  definition: WorkspaceSurfaceManualPaletteDefinition,
  options: WorkspaceSurfaceAutoPaletteOptions
): WorkspaceSurfaceAutoPaletteChoice {
  const palette = buildPaletteFromDefinition(definition, options);
  return {
    displayHex: palette[0]!,
    id: definition.id,
    palette,
    seedHex: palette[1]!
  };
}

export function getWorkspaceSurfaceAutoPaletteChoices(
  options: WorkspaceSurfaceAutoPaletteOptions
) {
  return WORKSPACE_SURFACE_MANUAL_PALETTES.map((definition) => createChoice(definition, options));
}

function shuffleArray<T>(input: readonly T[]) {
  const next = [...input];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
  }
  return next;
}

export function createRandomWorkspaceSurfacePalettes(
  options: WorkspaceSurfaceAutoPaletteOptions,
  count: number,
  excludePalettes: string[][] = []
) {
  const excludedSignatures = new Set(excludePalettes.map((palette) => palette.join('|')));
  const candidates = shuffleArray(getWorkspaceSurfaceAutoPaletteChoices(options));
  const usedFamilies = new Set<string>();
  const next: string[][] = [];

  for (const candidate of candidates) {
    const definition = WORKSPACE_SURFACE_MANUAL_PALETTES.find((entry) => entry.id === candidate.id);
    if (!definition || excludedSignatures.has(candidate.palette.join('|'))) {
      continue;
    }
    if (usedFamilies.has(definition.family) && candidates.length > count) {
      continue;
    }
    usedFamilies.add(definition.family);
    next.push(candidate.palette);
    if (next.length >= count) {
      return next;
    }
  }

  for (const candidate of candidates) {
    if (excludedSignatures.has(candidate.palette.join('|'))) {
      continue;
    }
    if (next.some((palette) => palette.join('|') === candidate.palette.join('|'))) {
      continue;
    }
    next.push(candidate.palette);
    if (next.length >= count) {
      break;
    }
  }

  return next;
}
