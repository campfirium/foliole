import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { parseLiteralUnion } from '../../../shared/lib/parseLiteralUnion';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import {
  type EditorMouseGestureActionId,
  type EditorMouseGestureBinding,
  type EditorMouseGestureId,
  EDITOR_MOUSE_GESTURE_IDS
} from './editorMouseGestures';

export const EDITOR_MOUSE_GESTURE_ACTION_SETTING_OPTIONS = ['disabled', 'scroll-top', 'scroll-bottom'] as const;
export const EDITOR_MOUSE_GESTURE_AREA_OPTIONS = ['main-panel'] as const;

export type EditorMouseGestureActionSetting = (typeof EDITOR_MOUSE_GESTURE_ACTION_SETTING_OPTIONS)[number];
export type EditorMouseGestureAreaId = (typeof EDITOR_MOUSE_GESTURE_AREA_OPTIONS)[number];

export interface EditorMouseGestureSettings {
  area: EditorMouseGestureAreaId;
  gestureActions: Record<EditorMouseGestureId, EditorMouseGestureActionSetting>;
  segmentThresholdPx: number;
  trailColor: string;
  trailLineWidth: number;
  trailOpacity: number;
  trailPointThresholdPx: number;
}

export const DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS: EditorMouseGestureSettings = {
  area: 'main-panel',
  gestureActions: {
    left: 'disabled',
    right: 'disabled',
    'left-up': 'scroll-top',
    'left-down': 'scroll-bottom'
  },
  segmentThresholdPx: 18,
  trailColor: '#2f3b4d',
  trailLineWidth: 3,
  trailOpacity: 0.25,
  trailPointThresholdPx: 6
};

const STORAGE_KEYS: Record<EditorMouseGestureId, string> = {
  left: APP_SETTINGS_STORAGE_KEYS.mouseGestureLeftAction,
  right: APP_SETTINGS_STORAGE_KEYS.mouseGestureRightAction,
  'left-up': APP_SETTINGS_STORAGE_KEYS.mouseGestureLeftUpAction,
  'left-down': APP_SETTINGS_STORAGE_KEYS.mouseGestureLeftDownAction
};

function normalizeActionSetting(value: string | null, fallback: EditorMouseGestureActionSetting) {
  return parseLiteralUnion(value, EDITOR_MOUSE_GESTURE_ACTION_SETTING_OPTIONS) ?? fallback;
}

function normalizeColor(value: string | null, fallback: string) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value?.trim() ?? '');
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function normalizeNumber(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed * 100) / 100));
}

function buildGestureActions() {
  return EDITOR_MOUSE_GESTURE_IDS.reduce<Record<EditorMouseGestureId, EditorMouseGestureActionSetting>>(
    (actions, gestureId) => {
      actions[gestureId] = normalizeActionSetting(
        getWhitelistedLocalStorageItem(STORAGE_KEYS[gestureId]),
        DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.gestureActions[gestureId]
      );
      return actions;
    },
    {} as Record<EditorMouseGestureId, EditorMouseGestureActionSetting>
  );
}

export function getEditorMouseGestureSettings(): EditorMouseGestureSettings {
  return {
    area: DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.area,
    gestureActions: buildGestureActions(),
    segmentThresholdPx: normalizeNumber(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureSegmentThreshold),
      DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.segmentThresholdPx,
      8,
      48
    ),
    trailColor: normalizeColor(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailColor),
      DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailColor
    ),
    trailLineWidth: normalizeNumber(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailLineWidth),
      DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailLineWidth,
      1,
      12
    ),
    trailOpacity: normalizeNumber(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailOpacity),
      DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailOpacity,
      0.05,
      1
    ),
    trailPointThresholdPx: normalizeNumber(
      getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailPointThreshold),
      DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailPointThresholdPx,
      2,
      24
    )
  };
}

export function setEditorMouseGestureAction(gestureId: EditorMouseGestureId, action: EditorMouseGestureActionSetting) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS[gestureId], normalizeActionSetting(action, 'disabled'));
}

export function setEditorMouseGestureTrailColor(value: string) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailColor,
    normalizeColor(value, DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailColor)
  );
}

export function setEditorMouseGestureTrailLineWidth(value: number) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailLineWidth,
    String(normalizeNumber(String(value), DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailLineWidth, 1, 12))
  );
}

export function setEditorMouseGestureTrailOpacity(value: number) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailOpacity,
    String(normalizeNumber(String(value), DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailOpacity, 0.05, 1))
  );
}

export function setEditorMouseGestureSegmentThreshold(value: number) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.mouseGestureSegmentThreshold,
    String(normalizeNumber(String(value), DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.segmentThresholdPx, 8, 48))
  );
}

export function setEditorMouseGestureTrailPointThreshold(value: number) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailPointThreshold,
    String(normalizeNumber(String(value), DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailPointThresholdPx, 2, 24))
  );
}

export function getEditorMouseGestureBindings(
  settings: EditorMouseGestureSettings
): EditorMouseGestureBinding[] {
  return EDITOR_MOUSE_GESTURE_IDS.flatMap((gestureId) => {
    const action = settings.gestureActions[gestureId];
    return action === 'disabled' ? [] : [{ action: action as EditorMouseGestureActionId, gesture: gestureId }];
  });
}
