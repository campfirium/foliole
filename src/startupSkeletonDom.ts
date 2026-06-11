import { APP_SETTINGS_STORAGE_KEYS } from './shared/config/appSettings';

const REGION_IDS = [
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
const DEFAULT_LIGHT_PALETTE = ['#b9b1a7', '#e7e3dd', '#f3eee8', '#ffffff', '#fbf9f7'];
const DEFAULT_DARK_PALETTE = ['#2b2f2a', '#252824', '#2b2f2a', '#1f211f', '#30362f'];
const DEFAULT_ASSIGNMENTS = {
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

function resolveMode(settings: Record<string, string>) {
  const baseColor = settings[APP_SETTINGS_STORAGE_KEYS.baseColor];
  if (baseColor === 'dark') return 'dark';
  if (baseColor === 'system' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function parseJson(value: string | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizePalette(input: unknown, mode: 'dark' | 'light') {
  const fallback = mode === 'dark' ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE;
  if (!Array.isArray(input)) return fallback;
  const normalized = input.filter((value): value is string => typeof value === 'string' && value.trim().startsWith('#'));
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeAssignment(input: unknown, regionId: keyof typeof DEFAULT_ASSIGNMENTS, paletteLength: number) {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const raw = record[regionId];
  const fallback = DEFAULT_ASSIGNMENTS[regionId];
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  return Math.min(Math.max(Math.round(value), 0), Math.max(0, paletteLength - 1));
}

function deriveDividerMixTarget(color: string) {
  const match = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match?.[1]) return 'black';
  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 >= 128 ? 'black' : 'white';
}

export function applyStartupSkeletonSettings(settings: Record<string, string>) {
  if (typeof document === 'undefined') return;
  const baseColor = settings[APP_SETTINGS_STORAGE_KEYS.baseColor];
  if (baseColor !== 'dark' && baseColor !== 'light' && baseColor !== 'system') return;
  const mode = resolveMode(settings);
  const paletteKey = mode === 'dark'
    ? APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePaletteDark
    : APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette;
  const assignmentsKey = mode === 'dark'
    ? APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignmentsDark
    : APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignments;
  const palette = normalizePalette(parseJson(settings[paletteKey]), mode);
  const assignments = parseJson(settings[assignmentsKey]);
  const root = document.documentElement;
  root.dataset.baseColor = baseColor;
  root.dataset.resolvedBaseColor = mode;
  root.style.setProperty('--workspace-divider-mix-target', mode === 'dark' ? 'white' : 'black');
  root.style.setProperty('--workspace-divider-subtle-surface-weight', mode === 'dark' ? '90%' : '92%');
  for (const regionId of REGION_IDS) {
    const color = palette[normalizeAssignment(assignments, regionId, palette.length)] ?? palette[0] ?? '#ffffff';
    const dividerMixTarget = deriveDividerMixTarget(color);
    root.style.setProperty(`--workspace-region-${regionId}-bg`, color);
    root.style.setProperty(`--workspace-region-${regionId}-divider-mix-target`, dividerMixTarget);
    root.style.setProperty(`--startup-region-${regionId}-bg`, color);
    root.style.setProperty(`--startup-region-${regionId}-divider-mix-target`, dividerMixTarget);
  }
  root.style.setProperty('--startup-document-bg', root.style.getPropertyValue('--startup-region-main-document-bg'));
  root.style.setProperty('--startup-list-bg', root.style.getPropertyValue('--startup-region-main-folder-bg'));
  root.style.setProperty('--startup-sidebar-bg', root.style.getPropertyValue('--startup-region-main-sidebar-bg'));
  root.style.setProperty('--startup-titlebar-bg', root.style.getPropertyValue('--startup-region-titlebar-document-bg'));
}
