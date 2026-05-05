import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export const WORKSPACE_SURFACE_REGION_IDS = [
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

export const DEFAULT_WORKSPACE_SURFACE_PALETTE: WorkspaceSurfacePalette = [
  '#ffffff',
  '#fcfcfc',
  '#f6f6f6',
  '#f5f5f3',
  '#ececea'
];

export const DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS: WorkspaceSurfaceAssignments = {
  'titlebar-rail': 1,
  'titlebar-folder': 1,
  'titlebar-topic': 1,
  'titlebar-document': 1,
  'titlebar-sidebar': 1,
  'main-rail': 2,
  'main-folder': 2,
  'main-topic': 2,
  'main-document': 0,
  'main-sidebar': 2,
  'footer-rail': 1,
  'footer-folder': 1,
  'footer-topic': 1,
  'footer-document': 1,
  'footer-sidebar': 1
};

const STORAGE_KEYS = {
  assignments: APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignments,
  palette: APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette
} as const;

function normalizeHexColor(value: string, fallback: string) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function clampAssignment(value: number, paletteLength: number) {
  if (paletteLength <= 0) {
    return 0;
  }
  return Math.min(Math.max(Math.round(value), 0), paletteLength - 1);
}

function normalizePalette(input: unknown): WorkspaceSurfacePalette {
  if (!Array.isArray(input)) {
    return [...DEFAULT_WORKSPACE_SURFACE_PALETTE];
  }
  const normalized = input
    .filter((value): value is string => typeof value === 'string')
    .map((value, index) => normalizeHexColor(value, DEFAULT_WORKSPACE_SURFACE_PALETTE[index] ?? DEFAULT_WORKSPACE_SURFACE_PALETTE[0]));
  return normalized.length > 0 ? normalized : [...DEFAULT_WORKSPACE_SURFACE_PALETTE];
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

export function getWorkspaceSurfacePalette() {
  return normalizePalette(parseStoredJson(STORAGE_KEYS.palette));
}

export function setWorkspaceSurfacePalette(value: WorkspaceSurfacePalette) {
  writeStoredJson(STORAGE_KEYS.palette, normalizePalette(value));
}

export function getWorkspaceSurfaceAssignments() {
  const palette = getWorkspaceSurfacePalette();
  return normalizeAssignments(parseStoredJson(STORAGE_KEYS.assignments), palette.length);
}

export function setWorkspaceSurfaceAssignments(value: WorkspaceSurfaceAssignments, paletteLength?: number) {
  writeStoredJson(
    STORAGE_KEYS.assignments,
    normalizeAssignments(value, paletteLength ?? getWorkspaceSurfacePalette().length)
  );
}

export function applyWorkspaceSurfaceSettings(
  root: HTMLElement,
  input: { assignments: WorkspaceSurfaceAssignments; palette: WorkspaceSurfacePalette }
) {
  const palette = normalizePalette(input.palette);
  const assignments = normalizeAssignments(input.assignments, palette.length);

  WORKSPACE_SURFACE_REGION_IDS.forEach((regionId) => {
    const color = palette[assignments[regionId]] ?? palette[0];
    root.style.setProperty(`--workspace-region-${regionId}-bg`, color);
  });
}
