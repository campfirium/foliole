export const INTERFACE_FONT_OPTIONS = ['default', 'inter', 'system', 'source-sans', 'serif', 'rounded'] as const;
export const MONOSPACE_FONT_OPTIONS = ['default', 'jetbrains', 'cascadia', 'consolas', 'fira', 'sarasa'] as const;

export type InterfaceFontPreset = (typeof INTERFACE_FONT_OPTIONS)[number];
export type MonospaceFontPreset = (typeof MONOSPACE_FONT_OPTIONS)[number];

export const INTERFACE_FONT_SIZE_MIN = 12;
export const INTERFACE_FONT_SIZE_MAX = 36;
export const INTERFACE_FONT_SIZE_DEFAULT = 17;

const STORAGE_KEYS = {
  interfaceFont: 'foliole-interface-font-preset',
  monospaceFont: 'foliole-monospace-font-preset',
  interfaceFontSize: 'foliole-interface-font-size'
} as const;

const INTERFACE_FONT_PRESET_VALUES: Record<InterfaceFontPreset, string> = {
  default:
    "'Inter Variable', Inter, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif",
  inter: "'Inter Variable', Inter, 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif",
  system: "'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', sans-serif",
  'source-sans': "'Source Sans 3', 'Segoe UI', 'PingFang SC', sans-serif",
  serif: "'Source Serif 4', 'Noto Serif CJK SC', Georgia, serif",
  rounded: "'SF Pro Rounded', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif"
};

const MONOSPACE_FONT_PRESET_VALUES: Record<MonospaceFontPreset, string> = {
  default:
    "'JetBrains Mono', 'Cascadia Code', 'Sarasa Mono SC', 'SFMono-Regular', Menlo, Consolas, 'Noto Sans Mono CJK SC', monospace",
  jetbrains: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
  cascadia: "'Cascadia Code', Consolas, 'JetBrains Mono', monospace",
  consolas: "Consolas, 'Cascadia Code', 'SFMono-Regular', Menlo, monospace",
  fira: "'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
  sarasa: "'Sarasa Mono SC', 'JetBrains Mono', 'Cascadia Code', monospace"
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

export function getInterfaceFontPreset(): InterfaceFontPreset {
  if (typeof window === 'undefined') {
    return 'default';
  }
  const raw = window.localStorage.getItem(STORAGE_KEYS.interfaceFont);
  return raw && isInterfaceFontPreset(raw) ? raw : 'default';
}

export function setInterfaceFontPreset(value: InterfaceFontPreset) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.interfaceFont, value);
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
  interfaceFont: InterfaceFontPreset;
  interfaceFontSize: number;
  monospaceFont: MonospaceFontPreset;
}

export function applyAppearanceSettings({ interfaceFont, interfaceFontSize, monospaceFont }: ApplyAppearanceSettingsInput) {
  if (typeof document === 'undefined') {
    return;
  }
  const clampedFontSize = clampFontSize(interfaceFontSize);
  const interfaceFontValue = INTERFACE_FONT_PRESET_VALUES[interfaceFont];
  const monospaceFontValue = MONOSPACE_FONT_PRESET_VALUES[monospaceFont];
  const root = document.documentElement;
  root.style.setProperty('--content-panel-font-family', interfaceFontValue);
  root.style.setProperty('--content-panel-mono-font-family', monospaceFontValue);
  root.style.setProperty('--content-panel-font-size', `${clampedFontSize}px`);
}
