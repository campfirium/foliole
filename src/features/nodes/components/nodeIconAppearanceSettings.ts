import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';

export const NODE_ICON_SHAPE_OPTIONS = ['hexagon', 'diamond', 'circle', 'square', 'triangle', 'leaf'] as const;
export const NODE_ICON_EFFECT_OPTIONS = ['none', 'double-line'] as const;

export type NodeIconShape = (typeof NODE_ICON_SHAPE_OPTIONS)[number];
export type NodeIconEffect = (typeof NODE_ICON_EFFECT_OPTIONS)[number];

export interface NodeIconStateAppearance {
  color: string;
  doubleLineDistance: number;
  effect: NodeIconEffect;
  fadeEnabled: boolean;
  fadeOpacity: number;
  fadeWholeRow: boolean;
  lineWidth: number;
  svg: string;
}

export const DEFAULT_NODE_ICON_STATE_APPEARANCE: Record<NodeTreeRowIconState, NodeIconStateAppearance> = {
  pending: {
    color: '#202124',
    doubleLineDistance: 2,
    effect: 'none',
    fadeEnabled: false,
    fadeOpacity: 1,
    fadeWholeRow: false,
    lineWidth: 1.2,
    svg: ''
  },
  scheduled: {
    color: '#202124',
    doubleLineDistance: 2,
    effect: 'double-line',
    fadeEnabled: false,
    fadeOpacity: 1,
    fadeWholeRow: false,
    lineWidth: 1.2,
    svg: ''
  },
  dismissed: {
    color: '#202124',
    doubleLineDistance: 2,
    effect: 'none',
    fadeEnabled: true,
    fadeOpacity: 0.35,
    fadeWholeRow: true,
    lineWidth: 1.2,
    svg: ''
  }
};

export function getDefaultNodeIconStateAppearance(state: NodeTreeRowIconState): NodeIconStateAppearance {
  return DEFAULT_NODE_ICON_STATE_APPEARANCE[state];
}

const STORAGE_KEYS = {
  pending: {
    color: APP_SETTINGS_STORAGE_KEYS.nodeIconPendingColor,
    lineWidth: APP_SETTINGS_STORAGE_KEYS.nodeIconPendingLineWidth
  },
  scheduled: {
    color: APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledColor,
    lineWidth: APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledLineWidth
  },
  dismissed: {
    color: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedColor,
    fadeEnabled: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeEnabled,
    fadeOpacity: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeOpacity,
    fadeWholeRow: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeWholeRow,
    lineWidth: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedLineWidth
  }
} as const;

const KIND_STORAGE_KEYS = {
  pending: {
    reading: APP_SETTINGS_STORAGE_KEYS.nodeIconPendingTopicAppearance,
    review: APP_SETTINGS_STORAGE_KEYS.nodeIconPendingItemAppearance
  },
  scheduled: {
    reading: APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledTopicAppearance,
    review: APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledItemAppearance
  },
  dismissed: {
    reading: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedTopicAppearance,
    review: APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedItemAppearance
  }
} as const;

function getDismissedStorageKeys() {
  return STORAGE_KEYS.dismissed;
}

function normalizeColor(value: string | null, fallback: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value?.trim() ?? '');
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function normalizeEffect(value: string | null, fallback: NodeIconEffect): NodeIconEffect {
  return NODE_ICON_EFFECT_OPTIONS.includes(value as NodeIconEffect)
    ? (value as NodeIconEffect)
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

function normalizeAppearanceOverride(
  value: string | null,
  fallback: NodeIconStateAppearance
): NodeIconStateAppearance {
  if (!value) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value) as Partial<Record<keyof NodeIconStateAppearance, unknown>>;
    return {
      color: normalizeColor(typeof parsed.color === 'string' ? parsed.color : null, fallback.color),
      doubleLineDistance: normalizePositiveNumber(String(parsed.doubleLineDistance ?? ''), fallback.doubleLineDistance),
      effect: normalizeEffect(typeof parsed.effect === 'string' ? parsed.effect : null, fallback.effect),
      fadeEnabled: typeof parsed.fadeEnabled === 'boolean' ? parsed.fadeEnabled : fallback.fadeEnabled,
      fadeOpacity: normalizeOpacity(String(parsed.fadeOpacity ?? ''), fallback.fadeOpacity),
      fadeWholeRow: typeof parsed.fadeWholeRow === 'boolean' ? parsed.fadeWholeRow : fallback.fadeWholeRow,
      lineWidth: normalizePositiveNumber(String(parsed.lineWidth ?? ''), fallback.lineWidth),
      svg: typeof parsed.svg === 'string' ? parsed.svg : fallback.svg
    };
  } catch {
    return fallback;
  }
}

export function getNodeIconStateAppearance(
  state: NodeTreeRowIconState,
  kind?: Extract<NodeTreeRowIconKind, 'reading' | 'review'>
): NodeIconStateAppearance {
  const defaults = getDefaultNodeIconStateAppearance(state);
  const keys = STORAGE_KEYS[state];
  const dismissedKeys = getDismissedStorageKeys();
  const legacyAppearance = {
    color: normalizeColor(getWhitelistedLocalStorageItem(keys.color), defaults.color),
    doubleLineDistance: defaults.doubleLineDistance,
    effect: defaults.effect,
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
    lineWidth: normalizePositiveNumber(getWhitelistedLocalStorageItem(keys.lineWidth), defaults.lineWidth),
    svg: defaults.svg
  };
  return kind ? normalizeAppearanceOverride(getWhitelistedLocalStorageItem(KIND_STORAGE_KEYS[state][kind]), legacyAppearance) : legacyAppearance;
}

export function getNodeIconStateAppearanceStorageKeys(state: NodeTreeRowIconState) {
  return STORAGE_KEYS[state];
}

export function getNodeIconKindStateAppearanceStorageKey(
  state: NodeTreeRowIconState,
  kind: Extract<NodeTreeRowIconKind, 'reading' | 'review'>
) {
  return KIND_STORAGE_KEYS[state][kind];
}

export function shouldFadeDismissedWholeRow() {
  const appearance = getNodeIconStateAppearance('dismissed');
  return appearance.fadeEnabled && appearance.fadeWholeRow;
}

export function getDismissedFadeOpacity() {
  return getNodeIconStateAppearance('dismissed').fadeOpacity;
}
