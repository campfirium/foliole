import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import {
  formatWorkspaceSurfaceColorCss,
  parseWorkspaceSurfaceColor,
  sanitizeWorkspaceSurfaceColor,
  workspaceSurfaceColorFromHsl,
  workspaceSurfaceColorToHsl
} from './workspaceSurfaceColor';
import { deriveDocumentTokenSurfaceColor } from './workspaceSurfaceDocumentTokens';
import { deriveScrollbarThumbColor } from './workspaceSurfaceScrollbars';

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
  'main-sidebar',
  'footer-rail',
  'footer-folder',
  'footer-topic',
  'footer-document',
  'footer-sidebar'
] as const;

export type WorkspaceSurfaceRegionId = (typeof WORKSPACE_SURFACE_REGION_IDS)[number];
export type WorkspaceSurfacePalette = string[];
export type WorkspaceSurfaceAssignments = Record<WorkspaceSurfaceRegionId, number>;
export type WorkspaceSurfaceColorMode = 'dark' | 'light';

export const DEFAULT_WORKSPACE_SURFACE_PALETTE: WorkspaceSurfacePalette = [
  '#b9b1a7',
  '#e7e3dd',
  '#f3eee8',
  '#ffffff',
  '#fbf9f7'
];

export const DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE: WorkspaceSurfacePalette = [
  '#171b1a',
  '#1a1f1e',
  '#1c2221',
  '#161918',
  '#1a1f1e'
];

export const DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS: WorkspaceSurfaceAssignments = {
  'titlebar-rail': 0,
  'titlebar-folder': 1,
  'titlebar-topic': 2,
  'titlebar-document': 3,
  'titlebar-sidebar': 4,
  'main-rail': 0,
  'main-folder': 1,
  'main-topic': 2,
  'main-document': 3,
  'main-sidebar': 4,
  'footer-rail': 0,
  'footer-folder': 1,
  'footer-topic': 2,
  'footer-document': 3,
  'footer-sidebar': 4
};

const STORAGE_KEYS = {
  assignments: APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignments,
  assignmentsDark: APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignmentsDark,
  paletteDark: APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePaletteDark,
  palette: APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette
} as const;
const WORKSPACE_FOLDER_TOPIC_DIVIDER_ROWS = ['titlebar', 'main', 'footer'] as const;
const LIGHT_SURFACE_THRESHOLD = 62;
const LIGHT_DIVIDER_SURFACE_THRESHOLD = 50;
const LIGHT_SIDEBAR_PANEL_LIGHTNESS_OFFSET = -1;
const LIGHT_SIDEBAR_PANEL_ELEVATED_LIGHTNESS_OFFSET = 1;
const DARK_SIDEBAR_PANEL_LIGHTNESS_OFFSET = 6;
const DARK_SIDEBAR_PANEL_ELEVATED_LIGHTNESS_OFFSET = 10;

function clampAssignment(value: number, paletteLength: number) {
  if (paletteLength <= 0) {
    return 0;
  }
  return Math.min(Math.max(Math.round(value), 0), paletteLength - 1);
}

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getDefaultWorkspaceSurfacePalette(mode: WorkspaceSurfaceColorMode) {
  return mode === 'dark' ? DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE : DEFAULT_WORKSPACE_SURFACE_PALETTE;
}

function getStorageKeys(mode: WorkspaceSurfaceColorMode) {
  return mode === 'dark'
    ? { assignments: STORAGE_KEYS.assignmentsDark, palette: STORAGE_KEYS.paletteDark }
    : { assignments: STORAGE_KEYS.assignments, palette: STORAGE_KEYS.palette };
}

function normalizePalette(input: unknown, mode: WorkspaceSurfaceColorMode = 'light'): WorkspaceSurfacePalette {
  const defaultPalette = getDefaultWorkspaceSurfacePalette(mode);
  if (!Array.isArray(input)) {
    return [...defaultPalette];
  }
  const normalized = input
    .filter((value): value is string => typeof value === 'string')
    .map((value, index) => sanitizeWorkspaceSurfaceColor(value, defaultPalette[index] ?? defaultPalette[0] ?? '#ffffff'));
  return normalized.length > 0 ? normalized : [...defaultPalette];
}

function normalizeAssignments(input: unknown, paletteLength: number): WorkspaceSurfaceAssignments {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return Object.fromEntries(
    WORKSPACE_SURFACE_REGION_IDS.map((regionId) => {
      const fallback = DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS[regionId];
      const rawValue = record[regionId];
      const assignment = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : fallback;
      return [regionId, clampAssignment(assignment, paletteLength)];
    })
  ) as WorkspaceSurfaceAssignments;
}

function parseStoredJson(key: string) {
  const raw = getWhitelistedLocalStorageItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown) {
  setWhitelistedLocalStorageItem(key, JSON.stringify(value));
}

function shiftSurfaceLightness(color: string, offset: number) {
  const parsed = parseWorkspaceSurfaceColor(color);
  if (!parsed) {
    return color;
  }
  const hsl = workspaceSurfaceColorToHsl(parsed);
  return formatWorkspaceSurfaceColorCss(
    workspaceSurfaceColorFromHsl({
      a: parsed.a,
      h: hsl.h,
      l: clampPercentage(hsl.l + offset),
      s: hsl.s
    })
  );
}

function derivePanelSurfaceColor(color: string, lightOffset: number, darkOffset: number) {
  const parsed = parseWorkspaceSurfaceColor(color);
  if (!parsed) {
    return color;
  }
  const lightness = workspaceSurfaceColorToHsl(parsed).l;
  const offset = lightness >= LIGHT_SURFACE_THRESHOLD ? lightOffset : darkOffset;
  return shiftSurfaceLightness(color, offset);
}

function deriveDividerMixTarget(color: string) {
  const parsed = parseWorkspaceSurfaceColor(color);
  if (!parsed) {
    return 'black';
  }
  return workspaceSurfaceColorToHsl(parsed).l >= LIGHT_DIVIDER_SURFACE_THRESHOLD ? 'black' : 'white';
}

export function getWorkspaceSurfacePalette(mode: WorkspaceSurfaceColorMode = 'light') {
  return normalizePalette(parseStoredJson(getStorageKeys(mode).palette), mode);
}

export function setWorkspaceSurfacePalette(value: WorkspaceSurfacePalette, mode: WorkspaceSurfaceColorMode = 'light') {
  writeStoredJson(getStorageKeys(mode).palette, normalizePalette(value, mode));
}

export function getWorkspaceSurfaceAssignments(mode: WorkspaceSurfaceColorMode = 'light') {
  const palette = getWorkspaceSurfacePalette(mode);
  return normalizeAssignments(parseStoredJson(getStorageKeys(mode).assignments), palette.length);
}

export function setWorkspaceSurfaceAssignments(
  value: WorkspaceSurfaceAssignments,
  paletteLength?: number,
  mode: WorkspaceSurfaceColorMode = 'light'
) {
  writeStoredJson(
    getStorageKeys(mode).assignments,
    normalizeAssignments(value, paletteLength ?? getWorkspaceSurfacePalette(mode).length)
  );
}

export function applyWorkspaceSurfaceSettings(
  root: HTMLElement,
  input: { assignments: WorkspaceSurfaceAssignments; palette: WorkspaceSurfacePalette }
) {
  const palette = normalizePalette(input.palette);
  const assignments = normalizeAssignments(input.assignments, palette.length);

  WORKSPACE_SURFACE_REGION_IDS.forEach((regionId) => {
    const color = palette[assignments[regionId]] ?? palette[0] ?? '#ffffff';
    root.style.setProperty(`--workspace-region-${regionId}-bg`, color);
    root.style.setProperty(
      `--workspace-region-${regionId}-divider-mix-target`,
      deriveDividerMixTarget(color)
    );
    root.style.setProperty(
      `--workspace-region-${regionId}-scrollbar-thumb-color`,
      deriveScrollbarThumbColor(regionId, color, palette, assignments)
    );
  });
  WORKSPACE_FOLDER_TOPIC_DIVIDER_ROWS.forEach((row) => {
    const folderColor = palette[assignments[`${row}-folder`]] ?? palette[0] ?? '#ffffff';
    const topicColor = palette[assignments[`${row}-topic`]] ?? palette[0] ?? '#ffffff';
    root.style.setProperty(
      `--workspace-divider-${row}-folder-topic-opacity`,
      folderColor === topicColor ? '0' : '1'
    );
  });
  const sidebarColor = palette[assignments['main-sidebar']] ?? palette[0] ?? '#ffffff';
  const documentColor = palette[assignments['main-document']] ?? palette[0] ?? '#ffffff';
  const documentTokenColor = deriveDocumentTokenSurfaceColor(documentColor, sidebarColor);
  root.style.setProperty('--workspace-region-main-document-token-bg', documentTokenColor);
  root.style.setProperty(
    '--workspace-region-main-document-token-divider-mix-target',
    deriveDividerMixTarget(documentTokenColor)
  );
  root.style.setProperty(
    '--workspace-region-main-document-scrollbar-thumb-color',
    deriveScrollbarThumbColor('main-document', documentTokenColor, palette, assignments)
  );
  root.style.setProperty(
    '--workspace-region-main-sidebar-panel-bg',
    derivePanelSurfaceColor(sidebarColor, LIGHT_SIDEBAR_PANEL_LIGHTNESS_OFFSET, DARK_SIDEBAR_PANEL_LIGHTNESS_OFFSET)
  );
  root.style.setProperty(
    '--workspace-region-main-sidebar-panel-elevated-bg',
    derivePanelSurfaceColor(sidebarColor, LIGHT_SIDEBAR_PANEL_ELEVATED_LIGHTNESS_OFFSET, DARK_SIDEBAR_PANEL_ELEVATED_LIGHTNESS_OFFSET)
  );
}
