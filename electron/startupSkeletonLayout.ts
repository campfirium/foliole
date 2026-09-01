import { APP_SETTINGS_STORAGE_KEYS, DEFAULT_BASE_COLOR_MODE } from '../src/shared/config/appSettings.js';

const MAX_LIST_WIDTH = 900;
const MAX_RIGHT_SIDEBAR_WIDTH = 640;
const MAX_DUAL_LIST_WIDTH = 420;
const MIN_DUAL_LIST_WIDTH = 100;
const MIN_LIST_WIDTH = 240;
const MIN_RIGHT_SIDEBAR_WIDTH = 240;
const DEFAULT_LIGHT_SURFACES = {
  document: '#ffffff',
  divider: 'rgba(32, 33, 36, 0.18)',
  list: '#e7e3dd',
  sidebar: '#fbf9f7',
  titlebar: '#ffffff'
};
const DEFAULT_DARK_SURFACES = {
  document: '#161918',
  divider: 'rgba(232, 230, 223, 0.12)',
  list: '#1a1f1e',
  sidebar: '#1a1f1e',
  titlebar: '#161918'
};
const DEFAULT_LIGHT_RGB = {
  background: '245 245 243',
  canvas: '255 255 255',
  foreground: '32 33 36',
  panel: '246 246 246'
};
const DEFAULT_DARK_RGB = {
  background: '17 20 19',
  canvas: '22 25 24',
  foreground: '232 230 223',
  panel: '26 31 30'
};
const WORKSPACE_SURFACE_REGION_IDS = [
  'titlebar-rail',
  'titlebar-folder',
  'titlebar-topic',
  'titlebar-document',
  'titlebar-sidebar',
  'main-rail',
  'main-folder',
  'main-topic',
  'main-document',
  'main-sidebar'
] as const;
const DEFAULT_LIGHT_WORKSPACE_SURFACE_PALETTE = ['#b9b1a7', '#e7e3dd', '#f3eee8', '#ffffff', '#fbf9f7'];
const DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE = ['#171b1a', '#1a1f1e', '#1c2221', '#161918', '#1a1f1e'];
const DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS = {
  'titlebar-rail': 0,
  'titlebar-folder': 1,
  'titlebar-topic': 2,
  'titlebar-document': 3,
  'titlebar-sidebar': 4,
  'main-rail': 0,
  'main-folder': 1,
  'main-topic': 2,
  'main-document': 3,
  'main-sidebar': 4
} as const;

export interface StartupSkeletonLayout {
  dualListWidth: number | null;
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  listWidth: number | null;
  mode: 'dark' | 'light';
  rightSidebarWidth: number | null;
}

export interface StartupSkeletonAppearance {
  backgroundColor: string;
  css: string;
  themeSource: 'dark' | 'light';
}

export interface StartupSkeletonLayoutOptions {
  systemColorMode?: 'dark' | 'light';
}

function readBooleanSetting(settings: Record<string, unknown>, key: string) {
  return settings[key] === 'true';
}

function readNumberSetting(settings: Record<string, unknown>, key: string, minValue: number, maxValue: number) {
  const value = Number(settings[key]);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.min(maxValue, Math.max(minValue, Math.round(value)));
}

export function createStartupSkeletonLayoutFromSettings(
  settings: Record<string, unknown>,
  options: StartupSkeletonLayoutOptions = {}
): StartupSkeletonLayout {
  const rawBaseColor = settings[APP_SETTINGS_STORAGE_KEYS.baseColor];
  const baseColor = rawBaseColor === 'dark' || rawBaseColor === 'light' || rawBaseColor === 'system'
    ? rawBaseColor
    : DEFAULT_BASE_COLOR_MODE;
  const mode = baseColor === 'dark' || (baseColor === 'system' && options.systemColorMode === 'dark') ? 'dark' : 'light';
  return {
    dualListWidth: readNumberSetting(settings, APP_SETTINGS_STORAGE_KEYS.dualListWidth, MIN_DUAL_LIST_WIDTH, MAX_DUAL_LIST_WIDTH),
    isListCollapsed: readBooleanSetting(settings, APP_SETTINGS_STORAGE_KEYS.listCollapsed),
    isRightSidebarCollapsed: readBooleanSetting(settings, APP_SETTINGS_STORAGE_KEYS.rightSidebarCollapsed),
    listWidth: readNumberSetting(settings, APP_SETTINGS_STORAGE_KEYS.listWidth, MIN_LIST_WIDTH, MAX_LIST_WIDTH),
    mode,
    rightSidebarWidth: readNumberSetting(
      settings,
      APP_SETTINGS_STORAGE_KEYS.rightSidebarWidth,
      MIN_RIGHT_SIDEBAR_WIDTH,
      MAX_RIGHT_SIDEBAR_WIDTH
    )
  };
}

function readJsonStringSetting(settings: Record<string, unknown>, key: string) {
  const raw = settings[key];
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function normalizePalette(input: unknown, mode: 'dark' | 'light') {
  const fallback = mode === 'dark' ? DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE : DEFAULT_LIGHT_WORKSPACE_SURFACE_PALETTE;
  if (!Array.isArray(input)) {
    return fallback;
  }
  const normalized = input.filter((value): value is string => typeof value === 'string' && value.trim().startsWith('#'));
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeAssignments(input: unknown, paletteLength: number) {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return Object.fromEntries(
    WORKSPACE_SURFACE_REGION_IDS.map((regionId) => {
      const raw = record[regionId];
      const fallback = DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS[regionId];
      const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
      return [regionId, Math.min(Math.max(Math.round(value), 0), Math.max(0, paletteLength - 1))];
    })
  ) as Record<(typeof WORKSPACE_SURFACE_REGION_IDS)[number], number>;
}

function readWorkspaceSurfaces(settings: Record<string, unknown>, mode: 'dark' | 'light') {
  const paletteKey =
    mode === 'dark' ? APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePaletteDark : APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette;
  const assignmentsKey =
    mode === 'dark'
      ? APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignmentsDark
      : APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignments;
  const palette = normalizePalette(readJsonStringSetting(settings, paletteKey), mode);
  const assignments = normalizeAssignments(readJsonStringSetting(settings, assignmentsKey), palette.length);
  return Object.fromEntries(
    WORKSPACE_SURFACE_REGION_IDS.map((regionId) => [regionId, palette[assignments[regionId]] ?? palette[0]])
  ) as Record<(typeof WORKSPACE_SURFACE_REGION_IDS)[number], string>;
}

function deriveDividerMixTarget(color: string) {
  const match = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return 'black';
  }
  const value = match[1];
  if (!value) {
    return 'black';
  }
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 >= 128 ? 'black' : 'white';
}

function cssVar(name: string, value: string | number | null) {
  if (value === null) {
    return '';
  }
  return `--${name}: ${typeof value === 'number' ? `${value}px` : value};`;
}

export function createStartupSkeletonCss(layout: StartupSkeletonLayout, settings: Record<string, unknown>) {
  const surfaces = layout.mode === 'dark' ? DEFAULT_DARK_SURFACES : DEFAULT_LIGHT_SURFACES;
  const rgb = layout.mode === 'dark' ? DEFAULT_DARK_RGB : DEFAULT_LIGHT_RGB;
  const workspaceSurfaces = readWorkspaceSurfaces(settings, layout.mode);
  const rawDisplayScalePercent = readNumberSetting(
    settings,
    APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent,
    80,
    200
  ) ?? 100;
  const displayScalePercent = Math.round(rawDisplayScalePercent / 10) * 10;
  return [
    `--startup-app-display-scale-percent: ${displayScalePercent};`,
    cssVar('color-canvas', rgb.canvas),
    cssVar('color-background', rgb.background),
    cssVar('color-bg-panel', rgb.panel),
    cssVar('color-foreground', rgb.foreground),
    ...WORKSPACE_SURFACE_REGION_IDS.flatMap((regionId) => [
      cssVar(`workspace-region-${regionId}-bg`, workspaceSurfaces[regionId]),
      cssVar(`workspace-region-${regionId}-divider-mix-target`, deriveDividerMixTarget(workspaceSurfaces[regionId])),
      cssVar(`startup-region-${regionId}-bg`, workspaceSurfaces[regionId]),
      cssVar(`startup-region-${regionId}-divider-mix-target`, deriveDividerMixTarget(workspaceSurfaces[regionId]))
    ]),
    cssVar('workspace-divider-mix-target', layout.mode === 'dark' ? 'white' : 'black'),
    cssVar('workspace-divider-subtle-surface-weight', layout.mode === 'dark' ? '93%' : '92%'),
    cssVar('startup-document-bg', workspaceSurfaces['main-document'] ?? surfaces.document),
    cssVar('startup-divider', surfaces.divider),
    cssVar('startup-list-bg', workspaceSurfaces['main-folder'] ?? surfaces.list),
    cssVar('startup-sidebar-bg', workspaceSurfaces['main-sidebar'] ?? surfaces.sidebar),
    cssVar('startup-titlebar-bg', workspaceSurfaces['titlebar-document'] ?? surfaces.titlebar),
    cssVar('startup-folder-column-width', layout.dualListWidth),
    cssVar('startup-list-width', layout.listWidth),
    cssVar('startup-right-sidebar-width', layout.rightSidebarWidth),
    cssVar('workspace-folder-column-width', 'var(--startup-folder-column-width)'),
    cssVar('workspace-list-current-width', 'var(--startup-list-current-width)'),
    cssVar('workspace-list-folder-current-width', 'min(var(--workspace-folder-column-width), var(--workspace-list-current-width))'),
    cssVar('workspace-titlebar-folder-column-width', 'var(--workspace-list-folder-current-width)'),
    cssVar('workspace-titlebar-list-current-width', 'var(--workspace-list-current-width)'),
    cssVar('workspace-right-sidebar-current-width', 'var(--startup-right-sidebar-current-width)'),
    layout.isListCollapsed ? '--startup-list-current-width: 0px;' : '',
    layout.isRightSidebarCollapsed ? '--startup-right-sidebar-current-width: 0px;' : ''
  ].filter(Boolean).join('');
}

export function createStartupSkeletonAppearance(
  layout: StartupSkeletonLayout,
  settings: Record<string, unknown>
): StartupSkeletonAppearance {
  const workspaceSurfaces = readWorkspaceSurfaces(settings, layout.mode);
  return {
    backgroundColor: workspaceSurfaces['main-document'],
    css: createStartupSkeletonCss(layout, settings),
    themeSource: layout.mode
  };
}
