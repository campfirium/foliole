import {
  formatWorkspaceSurfaceColorCss,
  parseWorkspaceSurfaceColor
} from './workspaceSurfaceColor';

const PALETTE_TEXT_COLOR_COUNT = 5;

export function parseWorkspaceSurfacePaletteText(value: string) {
  const colors = value
    .trim()
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (colors.length !== PALETTE_TEXT_COLOR_COUNT) {
    return null;
  }

  const parsed = colors.map((color) => {
    const value = parseWorkspaceSurfaceColor(color);
    return value ? formatWorkspaceSurfaceColorCss(value) : null;
  });

  return parsed.every((color): color is string => Boolean(color)) ? parsed : null;
}
