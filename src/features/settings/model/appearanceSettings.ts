export const INTERFACE_FONT_OPTIONS = ['default', 'inter', 'system', 'source-sans', 'serif', 'rounded', 'custom'] as const;
export const MONOSPACE_FONT_OPTIONS = ['default', 'jetbrains', 'cascadia', 'consolas', 'fira', 'sarasa', 'custom'] as const;

export type InterfaceFontPreset = (typeof INTERFACE_FONT_OPTIONS)[number];
export type MonospaceFontPreset = (typeof MONOSPACE_FONT_OPTIONS)[number];

export const INTERFACE_FONT_SIZE_MIN = 12;
export const INTERFACE_FONT_SIZE_MAX = 36;
export const INTERFACE_FONT_SIZE_DEFAULT = 17;

const STORAGE_KEYS = {
  uiFont: 'foliole-ui-font-preset',
  customUiFont: 'foliole-custom-ui-font-family',
  interfaceFont: 'foliole-interface-font-preset',
  monospaceFont: 'foliole-monospace-font-preset',
  interfaceFontSize: 'foliole-interface-font-size',
  customInterfaceFont: 'foliole-custom-interface-font-family',
  customMonospaceFont: 'foliole-custom-monospace-font-family'
} as const;

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

function isInterfaceFontPreset(value: string): value is InterfaceFontPreset {
  return INTERFACE_FONT_OPTIONS.includes(value as InterfaceFontPreset);
}

function isMonospaceFontPreset(value: string): value is MonospaceFontPreset {
  return MONOSPACE_FONT_OPTIONS.includes(value as MonospaceFontPreset);
}

function clampFontSize(value: number) {
  return Math.max(INTERFACE_FONT_SIZE_MIN, Math.min(INTERFACE_FONT_SIZE_MAX, Math.round(value)));
}

function sanitizeFontFamily(value: string) {
  return value.replace(/[;{}]/g, '').trim().slice(0, 256);
}

function quoteFontFamilyName(value: string) {
  return `'${value.replace(/'/g, "\\'")}'`;
}

function toPx(value: number) {
  return `${Math.round(value * 100) / 100}px`;
}

function applyEditorTypographyScale(root: HTMLElement, baseFontSize: number) {
  root.style.setProperty('--content-panel-font-size', `${baseFontSize}px`);
  root.style.setProperty('--content-panel-h1-font-size', toPx(baseFontSize * 1.42));
  root.style.setProperty('--content-panel-h2-font-size', toPx(baseFontSize * 1.18));
  root.style.setProperty('--content-panel-h3-font-size', toPx(baseFontSize * 1.04));
  root.style.setProperty('--content-panel-code-font-size', toPx(baseFontSize * 0.82));
}

export function getInterfaceFontPreset(): InterfaceFontPreset {
  if (typeof window === 'undefined') {
    return 'default';
  }
  const raw = window.localStorage.getItem(STORAGE_KEYS.interfaceFont);
  return raw && isInterfaceFontPreset(raw) ? raw : 'default';
}

export function getUiFontPreset(): InterfaceFontPreset {
  if (typeof window === 'undefined') {
    return 'default';
  }
  const raw = window.localStorage.getItem(STORAGE_KEYS.uiFont);
  return raw && isInterfaceFontPreset(raw) ? raw : 'default';
}

export function setUiFontPreset(value: InterfaceFontPreset) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.uiFont, value);
}

export function setInterfaceFontPreset(value: InterfaceFontPreset) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.interfaceFont, value);
}

export function getCustomUiFont() {
  if (typeof window === 'undefined') {
    return '';
  }
  const raw = window.localStorage.getItem(STORAGE_KEYS.customUiFont);
  return raw ? sanitizeFontFamily(raw) : '';
}

export function setCustomUiFont(value: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.customUiFont, sanitizeFontFamily(value));
}

export function getCustomInterfaceFont() {
  if (typeof window === 'undefined') {
    return '';
  }
  const raw = window.localStorage.getItem(STORAGE_KEYS.customInterfaceFont);
  return raw ? sanitizeFontFamily(raw) : '';
}

export function setCustomInterfaceFont(value: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.customInterfaceFont, sanitizeFontFamily(value));
}

export function getCustomMonospaceFont() {
  if (typeof window === 'undefined') {
    return '';
  }
  const raw = window.localStorage.getItem(STORAGE_KEYS.customMonospaceFont);
  return raw ? sanitizeFontFamily(raw) : '';
}

export function setCustomMonospaceFont(value: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.customMonospaceFont, sanitizeFontFamily(value));
}

export function getMonospaceFontPreset(): MonospaceFontPreset {
  if (typeof window === 'undefined') {
    return 'default';
  }
  const raw = window.localStorage.getItem(STORAGE_KEYS.monospaceFont);
  return raw && isMonospaceFontPreset(raw) ? raw : 'default';
}

export function setMonospaceFontPreset(value: MonospaceFontPreset) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.monospaceFont, value);
}

export function getInterfaceFontSize() {
  if (typeof window === 'undefined') {
    return INTERFACE_FONT_SIZE_DEFAULT;
  }
  const raw = window.localStorage.getItem(STORAGE_KEYS.interfaceFontSize);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampFontSize(parsed) : INTERFACE_FONT_SIZE_DEFAULT;
}

export function setInterfaceFontSize(value: number) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.interfaceFontSize, String(clampFontSize(value)));
}

interface ApplyAppearanceSettingsInput {
  uiFont: InterfaceFontPreset;
  customUiFont: string;
  interfaceFont: InterfaceFontPreset;
  interfaceFontSize: number;
  monospaceFont: MonospaceFontPreset;
  customInterfaceFont: string;
  customMonospaceFont: string;
}

function resolveInterfaceFontFamily(interfaceFont: InterfaceFontPreset, customInterfaceFont: string) {
  if (interfaceFont !== 'custom') {
    return INTERFACE_FONT_PRESET_VALUES[interfaceFont];
  }
  const sanitizedCustomFont = sanitizeFontFamily(customInterfaceFont);
  return sanitizedCustomFont ? `${quoteFontFamilyName(sanitizedCustomFont)}, ${SYSTEM_FONT_FALLBACK}` : SYSTEM_FONT_FALLBACK;
}

function resolveMonospaceFontFamily(monospaceFont: MonospaceFontPreset, customMonospaceFont: string) {
  if (monospaceFont !== 'custom') {
    return MONOSPACE_FONT_PRESET_VALUES[monospaceFont];
  }
  const sanitizedCustomFont = sanitizeFontFamily(customMonospaceFont);
  return sanitizedCustomFont
    ? `${quoteFontFamilyName(sanitizedCustomFont)}, ${MONOSPACE_FONT_PRESET_VALUES.default}`
    : MONOSPACE_FONT_PRESET_VALUES.default;
}

export function applyAppearanceSettings({
  uiFont,
  customUiFont,
  interfaceFont,
  interfaceFontSize,
  monospaceFont,
  customInterfaceFont,
  customMonospaceFont
}: ApplyAppearanceSettingsInput) {
  if (typeof document === 'undefined') {
    return;
  }
  const clampedFontSize = clampFontSize(interfaceFontSize);
  const uiFontValue = resolveInterfaceFontFamily(uiFont, customUiFont);
  const interfaceFontValue = resolveInterfaceFontFamily(interfaceFont, customInterfaceFont);
  const monospaceFontValue = resolveMonospaceFontFamily(monospaceFont, customMonospaceFont);
  const root = document.documentElement;
  root.style.setProperty('--app-interface-font-family', uiFontValue);
  root.style.setProperty('--content-panel-font-family', interfaceFontValue);
  root.style.setProperty('--content-panel-mono-font-family', monospaceFontValue);
  applyEditorTypographyScale(root, clampedFontSize);
}
