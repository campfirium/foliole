import {
  formatWorkspaceSurfaceColorCss,
  parseWorkspaceSurfaceColor,
  workspaceSurfaceColorFromHsl,
  workspaceSurfaceColorToHsl
} from './workspaceSurfaceColor';
import type {
  WorkspaceSurfaceAssignments,
  WorkspaceSurfacePalette,
  WorkspaceSurfaceRegionId
} from './workspaceSurfaceSettings';

const LIGHT_SURFACE_THRESHOLD = 62;
const LIGHT_SURFACE_SCROLLBAR_THUMB_LIGHTNESS_OFFSET = 8;
const DARK_SURFACE_SCROLLBAR_THUMB_LIGHTNESS_OFFSET = 12;
const MIN_SCROLLBAR_THUMB_SATURATION = 10;
const SCROLLBAR_THUMB_SATURATION_BOOST = 6;
const LOW_CHROMA_SURFACE_THRESHOLD = 4;

const WORKSPACE_SURFACE_SCROLLBAR_TINT_FALLBACKS: Partial<Record<WorkspaceSurfaceRegionId, WorkspaceSurfaceRegionId[]>> = {
  'main-document': ['main-topic', 'main-sidebar', 'main-folder'],
  'main-folder': ['main-topic', 'main-document'],
  'main-rail': ['main-folder', 'main-topic'],
  'main-sidebar': ['main-topic', 'main-document'],
  'main-topic': ['main-folder', 'main-document'],
  'titlebar-document': ['titlebar-topic', 'titlebar-sidebar', 'titlebar-folder'],
  'titlebar-folder': ['titlebar-topic', 'titlebar-document'],
  'titlebar-rail': ['titlebar-folder', 'titlebar-topic'],
  'titlebar-sidebar': ['titlebar-topic', 'titlebar-document'],
  'titlebar-topic': ['titlebar-folder', 'titlebar-document'],
  'footer-document': ['footer-topic', 'footer-sidebar', 'footer-folder'],
  'footer-folder': ['footer-topic', 'footer-document'],
  'footer-rail': ['footer-folder', 'footer-topic'],
  'footer-sidebar': ['footer-topic', 'footer-document'],
  'footer-topic': ['footer-folder', 'footer-document']
};

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function shiftSurfaceLightness(color: string, offset: number) {
  const parsed = parseWorkspaceSurfaceColor(color);
  if (!parsed) {
    return color;
  }
  const hsl = workspaceSurfaceColorToHsl(parsed);
  return formatWorkspaceSurfaceColorCss(
    workspaceSurfaceColorFromHsl({
      a: parsed.a,
      h: hsl.h,
      l: clampPercentage(hsl.l + offset),
      s: hsl.s
    })
  );
}

function getScrollbarLightnessOffset(lightness: number) {
  return lightness >= LIGHT_SURFACE_THRESHOLD
    ? -LIGHT_SURFACE_SCROLLBAR_THUMB_LIGHTNESS_OFFSET
    : DARK_SURFACE_SCROLLBAR_THUMB_LIGHTNESS_OFFSET;
}

function resolveScrollbarTintColor(
  regionId: WorkspaceSurfaceRegionId,
  palette: WorkspaceSurfacePalette,
  assignments: WorkspaceSurfaceAssignments
) {
  const fallbackRegionIds = WORKSPACE_SURFACE_SCROLLBAR_TINT_FALLBACKS[regionId] ?? [];
  return fallbackRegionIds
    .map((fallbackRegionId) => palette[assignments[fallbackRegionId]])
    .find((color): color is string => typeof color === 'string');
}

function deriveChromaticScrollbarThumbColor(color: string, tintColor?: string) {
  const parsed = parseWorkspaceSurfaceColor(color);
  if (!parsed) {
    return color;
  }
  const hsl = workspaceSurfaceColorToHsl(parsed);
  const offset = getScrollbarLightnessOffset(hsl.l);
  let thumbHue = hsl.h;
  let thumbSaturation = hsl.s;

  if (hsl.s < LOW_CHROMA_SURFACE_THRESHOLD && tintColor) {
    const parsedTint = parseWorkspaceSurfaceColor(tintColor);
    const tintHsl = parsedTint ? workspaceSurfaceColorToHsl(parsedTint) : null;
    if (tintHsl && tintHsl.s >= LOW_CHROMA_SURFACE_THRESHOLD) {
      thumbHue = tintHsl.h;
      thumbSaturation = tintHsl.s;
    }
  }
  if (thumbSaturation < LOW_CHROMA_SURFACE_THRESHOLD) {
    return shiftSurfaceLightness(color, offset);
  }
  return formatWorkspaceSurfaceColorCss(
    workspaceSurfaceColorFromHsl({
      a: parsed.a,
      h: thumbHue,
      l: clampPercentage(hsl.l + offset),
      s: clampPercentage(Math.max(thumbSaturation + SCROLLBAR_THUMB_SATURATION_BOOST, MIN_SCROLLBAR_THUMB_SATURATION))
    })
  );
}

export function deriveScrollbarThumbColor(
  regionId: WorkspaceSurfaceRegionId,
  color: string,
  palette: WorkspaceSurfacePalette,
  assignments: WorkspaceSurfaceAssignments
) {
  return deriveChromaticScrollbarThumbColor(color, resolveScrollbarTintColor(regionId, palette, assignments));
}
