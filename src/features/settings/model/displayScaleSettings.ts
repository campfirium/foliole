import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';

export const DEFAULT_APP_DISPLAY_SCALE_PERCENT = 100;
export const MIN_APP_DISPLAY_SCALE_PERCENT = 80;
export const MAX_APP_DISPLAY_SCALE_PERCENT = 200;
export const DEFAULT_PANEL_SCALE_PERCENT = 100;
export const MIN_PANEL_SCALE_PERCENT = 80;
export const MAX_PANEL_SCALE_PERCENT = 160;
export const APP_DISPLAY_SCALE_STEP = 10;
export const PANEL_SCALE_STEP = 5;

const PANEL_SCALE_IDS = [
  'folder-navigation',
  'topic-navigation',
  'document-panel',
  'list-panel',
  'right-panel:review-queue',
  'right-panel:outline',
  'right-panel:highlights',
  'right-panel:backlinks',
  'right-panel:assistant',
  'right-panel:performance',
  'right-panel:dev'
] as const;

export type PanelScaleId = typeof PANEL_SCALE_IDS[number];
export type PanelScales = Partial<Record<PanelScaleId, number>>;

function isPanelScaleId(value: string): value is PanelScaleId {
  return (PANEL_SCALE_IDS as readonly string[]).includes(value);
}

export function toRightPanelScaleId(panelId:
  | 'review-queue' | 'outline' | 'highlights' | 'backlinks' | 'assistant' | 'performance' | 'dev'
): PanelScaleId {
  return `right-panel:${panelId}`;
}

function clampSteppedPercent(value: number, min: number, max: number, step: number) {
  if (!Number.isFinite(value)) return min;
  const stepped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, stepped));
}

export function normalizeAppDisplayScalePercent(value: number) {
  return clampSteppedPercent(value, MIN_APP_DISPLAY_SCALE_PERCENT, MAX_APP_DISPLAY_SCALE_PERCENT, APP_DISPLAY_SCALE_STEP);
}

export function normalizePanelScalePercent(value: number) {
  return clampSteppedPercent(value, MIN_PANEL_SCALE_PERCENT, MAX_PANEL_SCALE_PERCENT, PANEL_SCALE_STEP);
}

export function getAppDisplayScalePercent() {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent);
  return raw === null ? DEFAULT_APP_DISPLAY_SCALE_PERCENT : normalizeAppDisplayScalePercent(Number(raw));
}

export function setAppDisplayScalePercent(value: number) {
  const normalized = normalizeAppDisplayScalePercent(value);
  if (normalized === DEFAULT_APP_DISPLAY_SCALE_PERCENT) {
    removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent);
  } else {
    setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent, String(normalized));
  }
  return normalized;
}

export function getPanelScales(): PanelScales {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.contentRegionScales);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized: PanelScales = {};
    for (const [regionId, value] of Object.entries(parsed)) {
      if (!isPanelScaleId(regionId) || typeof value !== 'number') continue;
      const percent = normalizePanelScalePercent(value);
      if (percent !== DEFAULT_PANEL_SCALE_PERCENT) {
        normalized[regionId] = percent;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

export function setPanelScales(value: PanelScales) {
  if (Object.keys(value).length === 0) {
    removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.contentRegionScales);
    return;
  }
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.contentRegionScales, JSON.stringify(value));
}
