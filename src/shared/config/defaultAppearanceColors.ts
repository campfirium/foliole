export type AppearanceDefaultColorMode = 'dark' | 'light';

export interface AppearanceDefaultColorSet {
  accent: string;
  cloze: string;
  font: string;
  highlight: string;
  selection: string;
}

export const DEFAULT_APPEARANCE_COLORS: Record<AppearanceDefaultColorMode, AppearanceDefaultColorSet> = {
  light: {
    accent: '#3f8f68',
    cloze: '#facc15',
    font: '#202124',
    highlight: '#38bdf8',
    selection: '#3876ff'
  },
  dark: {
    accent: '#7fb18d',
    cloze: '#e1c15a',
    font: '#e8e6df',
    highlight: '#5cc8f3',
    selection: '#78a6ff'
  }
} as const;

export const DEFAULT_NODE_ICON_COLOR = DEFAULT_APPEARANCE_COLORS.light.font;
export const DEFAULT_EDITOR_MOUSE_GESTURE_TRAIL_COLOR = '#2f3b4d';

export function hexColorToRgbChannels(value: string): string {
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);
  return `${red} ${green} ${blue}`;
}

function rgbChannelsToTuple(value: string) {
  return value.split(' ').map((channel) => Number(channel)) as [number, number, number];
}

function blendRgbChannels(sourceRgb: string, targetRgb: string, sourceWeight: number) {
  const source = rgbChannelsToTuple(sourceRgb);
  const target = rgbChannelsToTuple(targetRgb);
  return source.map((channel, index) => Math.round(channel * sourceWeight + target[index]! * (1 - sourceWeight))).join(' ');
}

export function deriveMutedForegroundRgb(fontRgb: string, mode: AppearanceDefaultColorMode) {
  const canvasRgb = mode === 'dark' ? '24 25 24' : '255 255 255';
  return blendRgbChannels(fontRgb, canvasRgb, mode === 'dark' ? 0.68 : 0.72);
}

export function getSelectionSurfaceAlpha(mode: AppearanceDefaultColorMode) {
  return mode === 'dark' ? 0.42 : 0.2;
}

export function getHighlightSurfaceAlpha(mode: AppearanceDefaultColorMode) {
  return mode === 'dark' ? 0.28 : 0.34;
}

export function getClozeSurfaceAlpha(mode: AppearanceDefaultColorMode) {
  return mode === 'dark' ? 0.24 : 0.34;
}
