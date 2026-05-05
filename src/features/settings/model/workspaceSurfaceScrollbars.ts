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
const LIGHT_SURFACE_SCROLLBAR_THUMB_LIGHTNESS_OFFSET = 2;
const DARK_SURFACE_SCROLLBAR_THUMB_LIGHTNESS_OFFSET = 4;

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function deriveLocalSurfaceScrollbarThumbColor(color: string) {
  const parsed = parseWorkspaceSurfaceColor(color);
  if (!parsed) {
    return color;
  }
  const hsl = workspaceSurfaceColorToHsl(parsed);
  const offset = getScrollbarLightnessOffset(hsl.l);
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

export function deriveScrollbarThumbColor(
  regionId: WorkspaceSurfaceRegionId,
  color: string,
  palette: WorkspaceSurfacePalette,
  assignments: WorkspaceSurfaceAssignments
) {
  void regionId;
  void palette;
  void assignments;
  return deriveLocalSurfaceScrollbarThumbColor(color);
}
