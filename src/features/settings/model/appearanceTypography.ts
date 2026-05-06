import type { InterfaceFontPreset, MonospaceFontPreset } from './appearanceSettings';
import type { ReadingLineHeight } from './appearanceSettingsOptions';

const TEXT_SYSTEM_FONT_FALLBACK = 'var(--font-family-text)';

const INTERFACE_FONT_PRESET_VALUES: Record<InterfaceFontPreset, string> = {
  default: TEXT_SYSTEM_FONT_FALLBACK,
  system: TEXT_SYSTEM_FONT_FALLBACK,
  serif: "'Source Serif 4', 'Noto Serif CJK SC', 'Songti SC', SimSun, Georgia, serif",
  custom: TEXT_SYSTEM_FONT_FALLBACK
};

const MONOSPACE_FONT_PRESET_VALUES: Record<MonospaceFontPreset, string> = {
  default:
    "'JetBrains Mono', 'Cascadia Code', 'Sarasa Mono SC', 'SFMono-Regular', Menlo, Consolas, 'Noto Sans Mono CJK SC', monospace",
  jetbrains: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
  cascadia: "'Cascadia Code', Consolas, 'JetBrains Mono', monospace",
  consolas: "Consolas, 'Cascadia Code', 'SFMono-Regular', Menlo, monospace",
  fira: "'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
  sarasa: "'Sarasa Mono SC', 'JetBrains Mono', 'Cascadia Code', monospace",
  custom: "'JetBrains Mono', 'Cascadia Code', 'Sarasa Mono SC', 'SFMono-Regular', Menlo, Consolas, 'Noto Sans Mono CJK SC', monospace"
};

const READING_LINE_HEIGHT_VALUES: Record<ReadingLineHeight, string> = {
  compact: '1.6',
  standard: '1.75',
  relaxed: '1.9'
};

const EDITOR_CODE_FONT_SCALE = 0.9;

function quoteFontFamilyName(value: string) {
  return `'${value.replace(/'/g, "\\'")}'`;
}

function toPx(value: number) {
  return `${Math.round(value * 100) / 100}px`;
}

export function resolveInterfaceFontFamily(interfaceFont: InterfaceFontPreset, customInterfaceFont: string) {
  if (interfaceFont !== 'custom') {
    return INTERFACE_FONT_PRESET_VALUES[interfaceFont];
  }
  return customInterfaceFont
    ? `${quoteFontFamilyName(customInterfaceFont)}, ${TEXT_SYSTEM_FONT_FALLBACK}`
    : TEXT_SYSTEM_FONT_FALLBACK;
}

export function resolveUiFontFamily() {
  return 'var(--font-family-interface)';
}

export function resolveMonospaceFontFamily(monospaceFont: MonospaceFontPreset, customMonospaceFont: string) {
  if (monospaceFont !== 'custom') {
    return MONOSPACE_FONT_PRESET_VALUES[monospaceFont];
  }
  return customMonospaceFont
    ? `${quoteFontFamilyName(customMonospaceFont)}, ${MONOSPACE_FONT_PRESET_VALUES.default}`
    : MONOSPACE_FONT_PRESET_VALUES.default;
}

export function applyEditorTypographyScale(root: HTMLElement, baseFontSize: number) {
  root.style.setProperty('--content-panel-font-size', `${baseFontSize}px`);
  root.style.setProperty('--content-panel-h1-font-size', toPx(baseFontSize * 1.42));
  root.style.setProperty('--content-panel-h2-font-size', toPx(baseFontSize * 1.18));
  root.style.setProperty('--content-panel-h3-font-size', toPx(baseFontSize * 1.04));
  root.style.setProperty('--content-panel-code-font-size', toPx(baseFontSize * EDITOR_CODE_FONT_SCALE));
}

export function applyReadingLineHeight(root: HTMLElement, lineHeight: ReadingLineHeight) {
  root.style.setProperty('--content-panel-line-height', READING_LINE_HEIGHT_VALUES[lineHeight]);
}
