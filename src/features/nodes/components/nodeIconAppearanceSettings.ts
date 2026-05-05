import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import type { NodeTreeRowIconState } from './NodeTreeRowIconModel';

export const NODE_ICON_SHAPE_OPTIONS = ['hexagon', 'diamond', 'circle', 'square', 'triangle', 'leaf'] as const;
export const NODE_ICON_STROKE_STYLE_OPTIONS = ['solid', 'dashed'] as const;

export type NodeIconShape = (typeof NODE_ICON_SHAPE_OPTIONS)[number];
export type NodeIconStrokeStyle = (typeof NODE_ICON_STROKE_STYLE_OPTIONS)[number];

export interface NodeIconStateAppearance {
  color: string;
  dashLength: number;
  fadeEnabled: boolean;
  fadeOpacity: number;
  fadeWholeRow: boolean;
  gapLength: number;
  lineWidth: number;
  strokeStyle: NodeIconStrokeStyle;
}

export const DEFAULT_NODE_ICON_STATE_APPEARANCE: Record<NodeTreeRowIconState, NodeIconStateAppearance> = {
  pending: {
    color: '#202124',
    dashLength: 1,
    fadeEnabled: false,
    fadeOpacity: 1,
    fadeWholeRow: false,
    gapLength: 2,
    lineWidth: 1.2,
    strokeStyle: 'dashed'
  },
  scheduled: {
    color: '#202124',
    dashLength: 1,
    fadeEnabled: false,
    fadeOpacity: 1,
    fadeWholeRow: false,
    gapLength: 2,
    lineWidth: 1.2,
    strokeStyle: 'solid'
  },
  dismissed: {
    color: '#202124',
    dashLength: 1,
    fadeEnabled: true,
    fadeOpacity: 0.35,
    fadeWholeRow: true,
    gapLength: 2,
    lineWidth: 1.2,
    strokeStyle: 'solid'
  }
};

const STORAGE_KEYS = {
  pending: {
    color: APP_SETTINGS_STORAGE_KEYS.nodeIconPendingColor,
    dashLength: APP_SETTINGS_STORAGE_KEYS.nodeIconPendingDashLength,
    gapLength: APP_SETTINGS_STORAGE_KEYS.nodeIconPendingGapLength,
    lineWidth: APP_SETTINGS_STORAGE_KEYS.nodeIconPendingLineWidth,
    strokeStyle: APP_SETTINGS_STORAGE_KEYS.nodeIconPendingStrokeStyle
  },
  scheduled: {
    color: APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledColor,
    dashLength: APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledDashLength,
    gapLength: APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledGapLength,
    lineWidth: APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledLineWidth,
    strokeStyle: APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledStrokeStyle
  },
  dismissed: {
    color: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedColor,
    dashLength: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedDashLength,
    fadeEnabled: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeEnabled,
    fadeOpacity: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeOpacity,
    fadeWholeRow: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeWholeRow,
    gapLength: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedGapLength,
    lineWidth: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedLineWidth,
    strokeStyle: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedStrokeStyle
  }
} as const;

function getDismissedStorageKeys() {
  return STORAGE_KEYS.dismissed;
}

function normalizeColor(value: string | null, fallback: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value?.trim() ?? '');
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function normalizeStrokeStyle(value: string | null, fallback: NodeIconStrokeStyle): NodeIconStrokeStyle {
  return NODE_ICON_STROKE_STYLE_OPTIONS.includes(value as NodeIconStrokeStyle)
    ? (value as NodeIconStrokeStyle)
    : fallback;
}

function normalizePositiveNumber(value: string | null, fallback: number) {
  if (value === null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0.25, Math.min(12, Math.round(parsed * 100) / 100));
}

function normalizeOpacity(value: string | null, fallback: number) {
  if (value === null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, Math.round(parsed * 100) / 100));
}

function normalizeBoolean(value: string | null, fallback: boolean) {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
}

export function getNodeIconStateAppearance(state: NodeTreeRowIconState): NodeIconStateAppearance {
  const defaults = DEFAULT_NODE_ICON_STATE_APPEARANCE[state];
  const keys = STORAGE_KEYS[state];
  const dismissedKeys = getDismissedStorageKeys();
  return {
    color: normalizeColor(getWhitelistedLocalStorageItem(keys.color), defaults.color),
    dashLength: normalizePositiveNumber(getWhitelistedLocalStorageItem(keys.dashLength), defaults.dashLength),
    fadeEnabled:
      state === 'dismissed'
        ? normalizeBoolean(getWhitelistedLocalStorageItem(dismissedKeys.fadeEnabled), defaults.fadeEnabled)
        : defaults.fadeEnabled,
    fadeOpacity:
      state === 'dismissed'
        ? normalizeOpacity(getWhitelistedLocalStorageItem(dismissedKeys.fadeOpacity), defaults.fadeOpacity)
        : defaults.fadeOpacity,
    fadeWholeRow:
      state === 'dismissed'
        ? normalizeBoolean(getWhitelistedLocalStorageItem(dismissedKeys.fadeWholeRow), defaults.fadeWholeRow)
        : defaults.fadeWholeRow,
    gapLength: normalizePositiveNumber(getWhitelistedLocalStorageItem(keys.gapLength), defaults.gapLength),
    lineWidth: normalizePositiveNumber(getWhitelistedLocalStorageItem(keys.lineWidth), defaults.lineWidth),
    strokeStyle: normalizeStrokeStyle(getWhitelistedLocalStorageItem(keys.strokeStyle), defaults.strokeStyle)
  };
}

export function getNodeIconStateAppearanceStorageKeys(state: NodeTreeRowIconState) {
  return STORAGE_KEYS[state];
}

export function shouldFadeDismissedWholeRow() {
  const appearance = getNodeIconStateAppearance('dismissed');
  return appearance.fadeEnabled && appearance.fadeWholeRow;
}

export function getDismissedFadeOpacity() {
  return getNodeIconStateAppearance('dismissed').fadeOpacity;
}
