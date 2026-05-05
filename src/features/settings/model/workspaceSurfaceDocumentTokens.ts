import {
  formatWorkspaceSurfaceColorCss,
  parseWorkspaceSurfaceColor,
  workspaceSurfaceColorFromHsl,
  workspaceSurfaceColorToHsl
} from './workspaceSurfaceColor';

const WHITE_DOCUMENT_LIGHTNESS_THRESHOLD = 94;
const WHITE_DOCUMENT_SATURATION_THRESHOLD = 8;
const WHITE_DOCUMENT_BORROWED_LIGHTNESS_OFFSET = -4;
const WHITE_DOCUMENT_BORROWED_SATURATION_RATIO = 0.45;

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function isWhiteDocumentSurface(color: string) {
  const parsed = parseWorkspaceSurfaceColor(color);
  if (!parsed) {
    return false;
  }
  const hsl = workspaceSurfaceColorToHsl(parsed);
  return hsl.l >= WHITE_DOCUMENT_LIGHTNESS_THRESHOLD && hsl.s <= WHITE_DOCUMENT_SATURATION_THRESHOLD;
}

export function deriveDocumentTokenSurfaceColor(documentColor: string, sidebarColor: string) {
  const documentParsed = parseWorkspaceSurfaceColor(documentColor);
  const sidebarParsed = parseWorkspaceSurfaceColor(sidebarColor);
  if (!documentParsed || !sidebarParsed || !isWhiteDocumentSurface(documentColor)) {
    return documentColor;
  }
  const documentHsl = workspaceSurfaceColorToHsl(documentParsed);
  const sidebarHsl = workspaceSurfaceColorToHsl(sidebarParsed);
  return formatWorkspaceSurfaceColorCss(
    workspaceSurfaceColorFromHsl({
      a: documentParsed.a,
      h: sidebarHsl.h,
      l: clampPercentage(documentHsl.l + WHITE_DOCUMENT_BORROWED_LIGHTNESS_OFFSET),
      s: clampPercentage(sidebarHsl.s * WHITE_DOCUMENT_BORROWED_SATURATION_RATIO)
    })
  );
}
