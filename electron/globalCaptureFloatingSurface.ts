import { BrowserWindow } from 'electron';

import { buildFloatingThemeReadScript } from './globalCaptureFloatingThemeScript.js';

const FLOATING_THEME_READ_TIMEOUT_MS = 120;
const PREVIEW_LIMIT = 48;

export interface GlobalCaptureFloatingTheme {
  accent: string;
  actionForeground: string;
  actionHoverBackground: string;
  actionHoverForeground: string;
  background: string;
  border: string;
  controlBorder: string;
  controlBorderHover: string;
  controlForeground: string;
  controlHoverBackground: string;
  controlRadius: string;
  contentInlinePadding: string;
  foreground: string;
  inputBackground: string;
  inputFontFamily: string;
  inputFontSize: string;
  inputLineHeight: string;
  inputPaddingBlockEnd: string;
  inputPaddingBlockStart: string;
  mutedForeground: string;
  placeholderForeground: string;
  radius: string;
  shadow: string;
  titleForeground: string;
  uiFontFamily: string;
  divider: string;
  hintVisible: boolean;
  strings: GlobalCaptureStrings;
}

interface GlobalCaptureStrings {
  hideHint: string;
  hideHintLabel: string;
  hint: string;
  locale: 'en' | 'zh-Hans';
  showHint: string;
  showHintLabel: string;
  placeholder: string;
  save: string;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function truncateCapturePreview(value: string) {
  const chars = Array.from(value.replace(/\s+/g, ' ').trim());
  if (chars.length <= PREVIEW_LIMIT) return chars.join('');
  return `${chars.slice(0, PREVIEW_LIMIT).join('').trimEnd()}...`;
}

function fallbackFloatingTheme(): GlobalCaptureFloatingTheme {
  return {
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
    divider: 'rgba(32, 33, 36, 0.10)',
    hintVisible: true,
    strings: resolveCaptureStrings('en')
  };
}

function isCssValue(value: unknown): value is string {
  return typeof value === 'string' && /^[#'",(),.%/ 0-9a-zA-Z -]+$/u.test(value.trim());
}

function isCaptureStrings(value: unknown): value is GlobalCaptureStrings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GlobalCaptureStrings>;
  return typeof candidate.hideHint === 'string'
    && typeof candidate.hideHintLabel === 'string'
    && typeof candidate.hint === 'string'
    && typeof candidate.showHint === 'string'
    && typeof candidate.showHintLabel === 'string'
    && typeof candidate.placeholder === 'string'
    && typeof candidate.save === 'string';
}

function resolveCaptureStrings(locale: string): GlobalCaptureStrings {
  if (locale === 'zh-Hans') {
    return {
      hideHint: '×',
      hideHintLabel: '隐藏提示',
      hint: '回车保存，空白时导入剪贴板',
      locale: 'zh-Hans',
      showHint: '?',
      showHintLabel: '显示提示',
      placeholder: '...',
      save: '保存'
    };
  }
  return {
    hideHint: '×',
    hideHintLabel: 'Hide shortcut hint',
    hint: 'Enter saves. Empty input imports the clipboard.',
    locale: 'en',
    showHint: '?',
    showHintLabel: 'Show shortcut hint',
    placeholder: '...',
    save: 'Save'
  };
}

function normalizeFloatingTheme(input: unknown): GlobalCaptureFloatingTheme | null {
  const fallback = fallbackFloatingTheme();
  if (!input || typeof input !== 'object') return fallback;
  const candidate = input as Partial<GlobalCaptureFloatingTheme> & { hasAppTheme?: unknown };
  if (candidate.hasAppTheme !== true) return null;
  return {
    accent: isCssValue(candidate.accent) ? candidate.accent : fallback.accent,
    actionForeground: isCssValue(candidate.actionForeground) ? candidate.actionForeground : fallback.actionForeground,
    actionHoverBackground: isCssValue(candidate.actionHoverBackground) ? candidate.actionHoverBackground : fallback.actionHoverBackground,
    actionHoverForeground: isCssValue(candidate.actionHoverForeground) ? candidate.actionHoverForeground : fallback.actionHoverForeground,
    background: isCssValue(candidate.background) ? candidate.background : fallback.background,
    border: isCssValue(candidate.border) ? candidate.border : fallback.border,
    controlBorder: isCssValue(candidate.controlBorder) ? candidate.controlBorder : fallback.controlBorder,
    controlBorderHover: isCssValue(candidate.controlBorderHover) ? candidate.controlBorderHover : fallback.controlBorderHover,
    controlForeground: isCssValue(candidate.controlForeground) ? candidate.controlForeground : fallback.controlForeground,
    controlHoverBackground: isCssValue(candidate.controlHoverBackground) ? candidate.controlHoverBackground : fallback.controlHoverBackground,
    controlRadius: isCssValue(candidate.controlRadius) ? candidate.controlRadius : fallback.controlRadius,
    contentInlinePadding: isCssValue(candidate.contentInlinePadding) ? candidate.contentInlinePadding : fallback.contentInlinePadding,
    foreground: isCssValue(candidate.foreground) ? candidate.foreground : fallback.foreground,
    inputBackground: isCssValue(candidate.inputBackground) ? candidate.inputBackground : fallback.inputBackground,
    inputFontFamily: isCssValue(candidate.inputFontFamily) ? candidate.inputFontFamily : fallback.inputFontFamily,
    inputFontSize: isCssValue(candidate.inputFontSize) ? candidate.inputFontSize : fallback.inputFontSize,
    inputLineHeight: isCssValue(candidate.inputLineHeight) ? candidate.inputLineHeight : fallback.inputLineHeight,
    inputPaddingBlockEnd: isCssValue(candidate.inputPaddingBlockEnd) ? candidate.inputPaddingBlockEnd : fallback.inputPaddingBlockEnd,
    inputPaddingBlockStart: isCssValue(candidate.inputPaddingBlockStart) ? candidate.inputPaddingBlockStart : fallback.inputPaddingBlockStart,
    mutedForeground: isCssValue(candidate.mutedForeground) ? candidate.mutedForeground : fallback.mutedForeground,
    placeholderForeground: isCssValue(candidate.placeholderForeground) ? candidate.placeholderForeground : fallback.placeholderForeground,
    radius: isCssValue(candidate.radius) ? candidate.radius : fallback.radius,
    shadow: isCssValue(candidate.shadow) ? candidate.shadow : fallback.shadow,
    titleForeground: isCssValue(candidate.titleForeground) ? candidate.titleForeground : fallback.titleForeground,
    uiFontFamily: isCssValue(candidate.uiFontFamily) ? candidate.uiFontFamily : fallback.uiFontFamily,
    divider: isCssValue(candidate.divider) ? candidate.divider : fallback.divider,
    hintVisible: typeof candidate.hintVisible === 'boolean' ? candidate.hintVisible : fallback.hintVisible,
    strings: isCaptureStrings(candidate.strings)
      ? { ...candidate.strings, locale: candidate.strings.locale === 'zh-Hans' ? 'zh-Hans' : 'en' }
      : fallback.strings
  };
}

async function readFloatingThemeFromAppWindow(excludedWindow: BrowserWindow): Promise<GlobalCaptureFloatingTheme> {
  const windows = BrowserWindow.getAllWindows().filter((candidate) => candidate !== excludedWindow && !candidate.isDestroyed());
  for (const window of windows) {
    const theme = normalizeFloatingTheme(await window.webContents.executeJavaScript(buildFloatingThemeReadScript(), true));
    if (theme) return theme;
  }
  return fallbackFloatingTheme();
}

export function resolveFloatingTheme(excludedWindow: BrowserWindow): Promise<GlobalCaptureFloatingTheme> {
  return Promise.race([
    readFloatingThemeFromAppWindow(excludedWindow).catch(() => fallbackFloatingTheme()),
    new Promise<GlobalCaptureFloatingTheme>((resolve) => {
      globalThis.setTimeout(() => resolve(fallbackFloatingTheme()), FLOATING_THEME_READ_TIMEOUT_MS);
    })
  ]);
}

export function buildFloatingThemeStyle(theme: GlobalCaptureFloatingTheme) {
  return [
    ':root{',
    `--capture-accent:${theme.accent};`,
    `--capture-action-fg:${theme.actionForeground};`,
    `--capture-action-hover-bg:${theme.actionHoverBackground};`,
    `--capture-action-hover-fg:${theme.actionHoverForeground};`,
    `--capture-bg:${theme.background};`,
    `--capture-border:${theme.border};`,
    `--capture-control-border:${theme.controlBorder};`,
    `--capture-control-border-hover:${theme.controlBorderHover};`,
    `--capture-control-fg:${theme.controlForeground};`,
    `--capture-control-hover-bg:${theme.controlHoverBackground};`,
    `--capture-control-radius:${theme.controlRadius};`,
    `--capture-content-inline-padding:${theme.contentInlinePadding};`,
    `--capture-fg:${theme.foreground};`,
    `--capture-input-bg:${theme.inputBackground};`,
    `--capture-input-font-family:${theme.inputFontFamily};`,
    `--capture-input-font-size:${theme.inputFontSize};`,
    `--capture-input-line-height:${theme.inputLineHeight};`,
    `--capture-input-padding-block-end:${theme.inputPaddingBlockEnd};`,
    `--capture-input-padding-block-start:${theme.inputPaddingBlockStart};`,
    `--capture-muted:${theme.mutedForeground};`,
    `--capture-placeholder:${theme.placeholderForeground};`,
    `--capture-radius:${theme.radius};`,
    `--capture-shadow:${theme.shadow};`,
    `--capture-title-fg:${theme.titleForeground};`,
    `--capture-ui-font-family:${theme.uiFontFamily};`,
    `--capture-divider:${theme.divider};`,
    '}',
    'html,body{box-sizing:border-box;margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:var(--capture-ui-font-family);}',
    'body{display:flex;align-items:center;justify-content:center;padding:0;color:var(--capture-fg);}',
    '.capture-surface{box-sizing:border-box;border:1px solid var(--capture-border);border-radius:var(--capture-radius);background:var(--capture-bg);box-shadow:var(--capture-shadow);}'
  ].join('');
}
