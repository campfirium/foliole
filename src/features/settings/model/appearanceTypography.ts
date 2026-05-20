import type { InterfaceFontPreset, MonospaceFontPreset } from './appearanceSettings';
import {
  DEFAULT_READING_LINE_HEIGHT,
  DEFAULT_READING_PARAGRAPH_SPACING,
  READING_LINE_HEIGHT_MAX,
  READING_LINE_HEIGHT_MIN,
  READING_LINE_HEIGHT_STEP,
  READING_PARAGRAPH_SPACING_MAX,
  READING_PARAGRAPH_SPACING_MIN,
  READING_PARAGRAPH_SPACING_STEP,
  type ReadingLineHeight,
  type ReadingParagraphSpacing
} from './appearanceSettingsOptions';

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

export function normalizeReadingLineHeight(value: unknown): ReadingLineHeight {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_READING_LINE_HEIGHT;
  }
  const clampedValue = Math.min(Math.max(numericValue, READING_LINE_HEIGHT_MIN), READING_LINE_HEIGHT_MAX);
  return Number((Math.round(clampedValue / READING_LINE_HEIGHT_STEP) * READING_LINE_HEIGHT_STEP).toFixed(2));
}

export function normalizeReadingParagraphSpacing(value: unknown): ReadingParagraphSpacing {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_READING_PARAGRAPH_SPACING;
  }
  const clampedValue = Math.min(Math.max(numericValue, READING_PARAGRAPH_SPACING_MIN), READING_PARAGRAPH_SPACING_MAX);
  return Number((Math.round(clampedValue / READING_PARAGRAPH_SPACING_STEP) * READING_PARAGRAPH_SPACING_STEP).toFixed(2));
}

export function applyReadingLineHeight(root: HTMLElement, lineHeight: ReadingLineHeight) {
  root.style.setProperty('--content-panel-line-height', String(normalizeReadingLineHeight(lineHeight)));
}

export function applyReadingParagraphSpacing(root: HTMLElement, paragraphSpacing: ReadingParagraphSpacing) {
  root.style.setProperty('--content-panel-paragraph-spacing', `${normalizeReadingParagraphSpacing(paragraphSpacing)}em`);
}
