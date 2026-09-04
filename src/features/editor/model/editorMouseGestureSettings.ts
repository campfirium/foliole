import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { DEFAULT_EDITOR_MOUSE_GESTURE_TRAIL_COLOR } from '../../../shared/config/defaultAppearanceColors';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';

import {
  DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS,
  readEditorMouseGestureBindings
} from './editorMouseGestureBindings';
import { type EditorMouseGestureBinding } from './editorMouseGestures';

export {
  addCustomEditorMouseGesture,
  DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS,
  hasCustomEditorMouseGestureBindings,
  resetEditorMouseGestureBindings,
  setEditorMouseGestureBinding
} from './editorMouseGestureBindings';

export interface EditorMouseGestureSettings {
  bindings: EditorMouseGestureBinding[];
  enabled: boolean;
  hintVisible: boolean;
  segmentThresholdPx: number;
  trailColor: string;
  trailLineWidth: number;
  trailOpacity: number;
  trailPointThresholdPx: number;
  trailVisible: boolean;
}

export const DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS: EditorMouseGestureSettings = {
  bindings: DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS,
  enabled: true,
  hintVisible: false,
  segmentThresholdPx: 18,
  trailColor: DEFAULT_EDITOR_MOUSE_GESTURE_TRAIL_COLOR,
  trailLineWidth: 3,
  trailOpacity: 0.25,
  trailPointThresholdPx: 6,
  trailVisible: true
};

function normalizeBoolean(value: string | null, fallback: boolean) {
  return value === 'true' ? true : value === 'false' ? false : fallback;
}

function normalizeColor(value: string | null, fallback: string) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value?.trim() ?? '');
  return match?.[1] ? `#${match[1].toLowerCase()}` : fallback;
}

function normalizeNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value === null || value.trim() === '' ? Number.NaN : Number(value);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, Math.round(parsed * 100) / 100))
    : fallback;
}

export function getEditorMouseGestureSettings(): EditorMouseGestureSettings {
  return {
    bindings: readEditorMouseGestureBindings(),
    enabled: normalizeBoolean(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGesturesEnabled),
      true
    ),
    hintVisible: normalizeBoolean(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureHintVisible),
      false
    ),
    segmentThresholdPx: normalizeNumber(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureSegmentThreshold),
      18,
      8,
      48
    ),
    trailColor: normalizeColor(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailColor),
      DEFAULT_EDITOR_MOUSE_GESTURE_TRAIL_COLOR
    ),
    trailLineWidth: normalizeNumber(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailLineWidth),
      3,
      1,
      12
    ),
    trailOpacity: normalizeNumber(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailOpacity),
      0.25,
      0.05,
      1
    ),
    trailPointThresholdPx: normalizeNumber(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailPointThreshold),
      6,
      2,
      24
    ),
    trailVisible: normalizeBoolean(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailVisible),
      true
    )
  };
}

export function setEditorMouseGestureBoolean(
  key: 'enabled' | 'hintVisible' | 'trailVisible',
  value: boolean
) {
  const storageKey =
    key === 'enabled'
      ? APP_SETTINGS_STORAGE_KEYS.mouseGesturesEnabled
      : key === 'hintVisible'
        ? APP_SETTINGS_STORAGE_KEYS.mouseGestureHintVisible
        : APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailVisible;
  setWhitelistedLocalStorageItem(storageKey, String(value));
}

function setNumber(key: string, value: number, fallback: number, min: number, max: number) {
  setWhitelistedLocalStorageItem(key, String(normalizeNumber(String(value), fallback, min, max)));
}

export function setEditorMouseGestureTrailColor(value: string) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailColor,
    normalizeColor(value, DEFAULT_EDITOR_MOUSE_GESTURE_TRAIL_COLOR)
  );
}
export function setEditorMouseGestureTrailLineWidth(value: number) {
  setNumber(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailLineWidth, value, 3, 1, 12);
}
export function setEditorMouseGestureTrailOpacity(value: number) {
  setNumber(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailOpacity, value, 0.25, 0.05, 1);
}
export function setEditorMouseGestureSegmentThreshold(value: number) {
  setNumber(APP_SETTINGS_STORAGE_KEYS.mouseGestureSegmentThreshold, value, 18, 8, 48);
}
export function setEditorMouseGestureTrailPointThreshold(value: number) {
  setNumber(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailPointThreshold, value, 6, 2, 24);
}
