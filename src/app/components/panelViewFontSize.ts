export const PANEL_FONT_SIZE_MIN = 10;
export const PANEL_FONT_SIZE_MAX = 24;
export const PANEL_FONT_SIZE_DEFAULT = 15;

export function normalizePanelViewFontSize(value: unknown, defaultSize = PANEL_FONT_SIZE_DEFAULT) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultSize;
  return Math.max(PANEL_FONT_SIZE_MIN, Math.min(PANEL_FONT_SIZE_MAX, Math.round(value)));
}
