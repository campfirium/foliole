import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { parseLiteralUnion } from '../../../shared/lib/parseLiteralUnion';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export const LONG_CLOZE_FRONT_GUARD_THRESHOLD = 500;
export const LONG_CLOZE_SELECTION_GUARD_MIN = 20;
export const LONG_CLOZE_FRONT_GUARD_MODE_OPTIONS = ['remind', 'convert', 'off'] as const;

export type LongClozeFrontGuardMode = (typeof LONG_CLOZE_FRONT_GUARD_MODE_OPTIONS)[number];

export const DEFAULT_LONG_CLOZE_FRONT_GUARD_MODE: LongClozeFrontGuardMode = 'remind';

function normalizeLongClozeFrontGuardMode(value: string | null | undefined): LongClozeFrontGuardMode {
  return parseLiteralUnion(value, LONG_CLOZE_FRONT_GUARD_MODE_OPTIONS) ?? DEFAULT_LONG_CLOZE_FRONT_GUARD_MODE;
}

function normalizeGuardNumber(value: string | number | null | undefined, fallback: number, min: number, max: number) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export function getLongClozeFrontGuardMode(): LongClozeFrontGuardMode {
  return normalizeLongClozeFrontGuardMode(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardMode)
  );
}

export function getLongClozeSelectionGuardMin(): number {
  return normalizeGuardNumber(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardSelectionMin),
    LONG_CLOZE_SELECTION_GUARD_MIN,
    0,
    500
  );
}

export function getLongClozeFrontGuardThreshold(): number {
  return normalizeGuardNumber(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardFrontMax),
    LONG_CLOZE_FRONT_GUARD_THRESHOLD,
    50,
    10000
  );
}

export function setLongClozeFrontGuardMode(value: string): LongClozeFrontGuardMode {
  const nextValue = normalizeLongClozeFrontGuardMode(value);
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardMode, nextValue);
  return nextValue;
}

export function setLongClozeSelectionGuardMin(value: string | number): number {
  const nextValue = normalizeGuardNumber(value, LONG_CLOZE_SELECTION_GUARD_MIN, 0, 500);
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardSelectionMin, String(nextValue));
  return nextValue;
}

export function setLongClozeFrontGuardThreshold(value: string | number): number {
  const nextValue = normalizeGuardNumber(value, LONG_CLOZE_FRONT_GUARD_THRESHOLD, 50, 10000);
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardFrontMax, String(nextValue));
  return nextValue;
}
