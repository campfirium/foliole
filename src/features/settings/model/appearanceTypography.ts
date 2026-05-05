import type { InterfaceFontPreset, MonospaceFontPreset } from './appearanceSettings';

const SYSTEM_FONT_FALLBACK =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif";

const INTERFACE_FONT_PRESET_VALUES: Record<InterfaceFontPreset, string> = {
  default: SYSTEM_FONT_FALLBACK,
  inter:
    "'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif",
  system: SYSTEM_FONT_FALLBACK,
  'source-sans':
    "'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif",
  serif: "'Source Serif 4', 'Noto Serif CJK SC', 'Songti SC', SimSun, Georgia, serif",
  rounded:
    "'SF Pro Rounded', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif",
  custom: SYSTEM_FONT_FALLBACK
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
  return customInterfaceFont ? `${quoteFontFamilyName(customInterfaceFont)}, ${SYSTEM_FONT_FALLBACK}` : SYSTEM_FONT_FALLBACK;
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
  root.style.setProperty('--content-panel-code-font-size', toPx(baseFontSize * 0.82));
}
