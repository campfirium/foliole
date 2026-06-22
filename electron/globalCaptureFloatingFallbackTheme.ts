import type { GlobalCaptureFloatingTheme } from './globalCaptureFloatingSurface.js';

export type ResolvedBaseColor = 'dark' | 'light';

type CaptureStrings = GlobalCaptureFloatingTheme['strings'];

const LIGHT_FALLBACK_THEME = {
  accent: '#3f8f68',
  actionForeground: 'rgba(32, 33, 36, 0.62)',
  actionHoverBackground: 'rgba(32, 33, 36, 0.08)',
  actionHoverForeground: 'rgba(32, 33, 36, 0.78)',
  background: 'rgb(255, 255, 255)',
  border: 'rgba(32, 33, 36, 0.10)',
  controlBorder: 'rgba(32, 33, 36, 0.16)',
  controlBorderHover: 'rgba(32, 33, 36, 0.24)',
  controlForeground: 'rgba(32, 33, 36, 0.52)',
  controlHoverBackground: 'rgba(32, 33, 36, 0.04)',
  controlRadius: '8px',
  contentInlinePadding: '26px',
  foreground: 'rgb(32, 33, 36)',
  inputBackground: 'rgb(255, 255, 255)',
  inputFontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable","Segoe UI","Microsoft YaHei UI",sans-serif',
  inputFontSize: '15.64px',
  inputLineHeight: '1.75',
  inputPaddingBlockEnd: '12px',
  inputPaddingBlockStart: '24px',
  mutedForeground: 'rgb(94, 95, 97)',
  placeholderForeground: 'rgba(32, 33, 36, 0.36)',
  radius: '8px',
  shadow: '0 8px 22px rgb(15 17 19 / 0.045), 0 1px 2px rgb(15 17 19 / 0.03)',
  titleForeground: 'rgba(32, 33, 36, 0.68)',
  uiFontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable","Segoe UI","Microsoft YaHei UI",sans-serif',
  divider: 'rgba(32, 33, 36, 0.10)'
} as const;

const DARK_FALLBACK_THEME = {
  ...LIGHT_FALLBACK_THEME,
  accent: '#7fb18d',
  actionForeground: 'rgba(232, 230, 223, 0.62)',
  actionHoverBackground: 'rgba(232, 230, 223, 0.06)',
  actionHoverForeground: 'rgba(232, 230, 223, 0.78)',
  background: 'rgb(42, 45, 41)',
  border: 'rgb(80, 84, 78)',
  controlBorder: 'rgba(232, 230, 223, 0.18)',
  controlBorderHover: 'rgba(232, 230, 223, 0.30)',
  controlForeground: 'rgba(232, 230, 223, 0.58)',
  controlHoverBackground: 'rgba(232, 230, 223, 0.06)',
  foreground: 'rgb(232, 230, 223)',
  inputBackground: 'rgb(36, 39, 35)',
  mutedForeground: 'rgb(165, 164, 159)',
  placeholderForeground: 'rgba(232, 230, 223, 0.36)',
  shadow: '0 10px 26px rgb(0 0 0 / 0.18), 0 1px 3px rgb(0 0 0 / 0.14)',
  titleForeground: 'rgba(232, 230, 223, 0.64)',
  divider: 'rgba(232, 230, 223, 0.10)'
} as const;

export function fallbackFloatingTheme(mode: ResolvedBaseColor, strings: CaptureStrings): GlobalCaptureFloatingTheme {
  return {
    ...(mode === 'dark' ? DARK_FALLBACK_THEME : LIGHT_FALLBACK_THEME),
    hintVisible: true,
    strings
  };
}
