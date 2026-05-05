import { APP_SETTINGS_STORAGE_KEYS } from '../src/shared/config/appSettings.js';

import { loadJsonSetting } from './database/settingsStore.js';

const APP_SETTINGS_KEY = 'app_settings';
const MAX_LIST_WIDTH = 900;
const MAX_RIGHT_SIDEBAR_WIDTH = 640;
const MIN_LIST_WIDTH = 240;
const MIN_RIGHT_SIDEBAR_WIDTH = 240;
const DEFAULT_LIGHT_SURFACES = {
  document: '#ffffff',
  divider: 'rgba(32, 33, 36, 0.18)',
  list: '#f6f6f6',
  sidebar: '#f6f6f6',
  titlebar: '#fcfcfc'
};
const DEFAULT_DARK_SURFACES = {
  document: '#1f211f',
  divider: 'rgba(232, 230, 223, 0.18)',
  list: '#2b2f2a',
  sidebar: '#2b2f2a',
  titlebar: '#252824'
};
const DEFAULT_LIGHT_RGB = {
  background: '245 245 243',
  canvas: '255 255 255',
  foreground: '32 33 36',
  panel: '246 246 246'
};
const DEFAULT_DARK_RGB = {
  background: '20 21 20',
  canvas: '24 25 24',
  foreground: '232 230 223',
  panel: '37 40 36'
};

export interface StartupSkeletonLayout {
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  listWidth: number | null;
  rightSidebarWidth: number | null;
  mode: 'dark' | 'light';
}

export interface StartupSkeletonAppearance {
  backgroundColor: string;
  css: string;
  themeSource: 'dark' | 'light';
}

function readAppSettingsRecord() {
  try {
    const payload = loadJsonSetting(APP_SETTINGS_KEY);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    return payload as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readBooleanSetting(settings: Record<string, unknown>, key: string) {
  return settings[key] === 'true';
}

function readNumberSetting(
  settings: Record<string, unknown>,
  key: string,
  minValue: number,
  maxValue: number
) {
  const value = Number(settings[key]);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.min(maxValue, Math.max(minValue, Math.round(value)));
}

export function loadStartupSkeletonLayout(): StartupSkeletonLayout {
  const settings = readAppSettingsRecord();
  const mode = settings[APP_SETTINGS_STORAGE_KEYS.baseColor] === 'dark' ? 'dark' : 'light';
  return {
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

function cssVar(name: string, value: string | number | null) {
  if (value === null) {
    return '';
  }
  return `--${name}: ${typeof value === 'number' ? `${value}px` : value};`;
}

export function createStartupSkeletonCss(layout: StartupSkeletonLayout) {
  const surfaces = layout.mode === 'dark' ? DEFAULT_DARK_SURFACES : DEFAULT_LIGHT_SURFACES;
  const rgb = layout.mode === 'dark' ? DEFAULT_DARK_RGB : DEFAULT_LIGHT_RGB;
  return [
    cssVar('color-canvas', rgb.canvas),
    cssVar('color-background', rgb.background),
    cssVar('color-bg-panel', rgb.panel),
    cssVar('color-foreground', rgb.foreground),
    cssVar('workspace-region-titlebar-rail-bg', surfaces.titlebar),
    cssVar('workspace-region-titlebar-folder-bg', surfaces.titlebar),
    cssVar('workspace-region-titlebar-topic-bg', surfaces.titlebar),
    cssVar('workspace-region-titlebar-document-bg', surfaces.titlebar),
    cssVar('workspace-region-titlebar-sidebar-bg', surfaces.titlebar),
    cssVar('workspace-region-main-rail-bg', surfaces.list),
    cssVar('workspace-region-main-folder-bg', surfaces.list),
    cssVar('workspace-region-main-topic-bg', surfaces.list),
    cssVar('workspace-region-main-document-bg', surfaces.document),
    cssVar('workspace-region-main-sidebar-bg', surfaces.sidebar),
    cssVar('startup-document-bg', surfaces.document),
    cssVar('startup-divider', surfaces.divider),
    cssVar('startup-list-bg', surfaces.list),
    cssVar('startup-sidebar-bg', surfaces.sidebar),
    cssVar('startup-titlebar-bg', surfaces.titlebar),
    cssVar('startup-list-width', layout.listWidth),
    cssVar('startup-right-sidebar-width', layout.rightSidebarWidth),
    layout.isListCollapsed ? '--startup-list-current-width: 0px;' : '',
    layout.isRightSidebarCollapsed ? '--startup-right-sidebar-current-width: 0px;' : ''
  ].filter(Boolean).join('');
}

export function loadStartupSkeletonCss() {
  return createStartupSkeletonCss(loadStartupSkeletonLayout());
}

export function createStartupSkeletonAppearance(layout: StartupSkeletonLayout): StartupSkeletonAppearance {
  const surfaces = layout.mode === 'dark' ? DEFAULT_DARK_SURFACES : DEFAULT_LIGHT_SURFACES;
  return {
    backgroundColor: surfaces.document,
    css: createStartupSkeletonCss(layout),
    themeSource: layout.mode
  };
}

export function loadStartupSkeletonAppearance() {
  return createStartupSkeletonAppearance(loadStartupSkeletonLayout());
}
