import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { parseLiteralUnion } from '../../../shared/lib/parseLiteralUnion';
import { getWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import {
  DEFAULT_NODE_ICON_BASE_APPEARANCE,
  DEFAULT_NODE_ICON_STATE_APPEARANCE,
  NODE_ICON_EFFECT_OPTIONS,
  type NodeIconBaseAppearance,
  type NodeIconEffect,
  type NodeIconStateAppearance
} from './nodeIconAppearanceModel';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';

export {
  DEFAULT_NODE_ICON_BASE_APPEARANCE,
  DEFAULT_NODE_ICON_STATE_APPEARANCE,
  NODE_ICON_EFFECT_OPTIONS,
  NODE_ICON_SHAPE_OPTIONS
} from './nodeIconAppearanceModel';
export type {
  NodeIconBaseAppearance,
  NodeIconEffect,
  NodeIconShape,
  NodeIconStateAppearance
} from './nodeIconAppearanceModel';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;

export function getDefaultNodeIconStateAppearance(state: NodeTreeRowIconState): NodeIconStateAppearance {
  return DEFAULT_NODE_ICON_STATE_APPEARANCE[state];
}

const BASE_STORAGE_KEYS = {
  reading: APP_SETTINGS_STORAGE_KEYS.nodeIconPrimaryAppearance,
  review: APP_SETTINGS_STORAGE_KEYS.nodeIconSecondaryAppearance
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

function normalizeColor(value: string | null, fallback: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value?.trim() ?? '');
  return match?.[1] ? `#${match[1].toLowerCase()}` : fallback;
}

function normalizeEffect(value: string | null, fallback: NodeIconEffect): NodeIconEffect {
  return parseLiteralUnion(value, NODE_ICON_EFFECT_OPTIONS) ?? fallback;
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

function normalizeNonNegativeNumber(value: string | null, fallback: number) {
  if (value === null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(12, Math.round(parsed * 100) / 100));
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

function normalizeAppearanceOverride(
  value: string | null,
  fallback: NodeIconStateAppearance
): NodeIconStateAppearance {
  if (!value) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value) as Partial<Record<keyof NodeIconStateAppearance | 'fadeWholeRow', unknown>>;
    const legacyWholeRow = typeof parsed.fadeWholeRow === 'boolean' ? parsed.fadeWholeRow : null;
    const legacyTextOpacity = legacyWholeRow === false ? fallback.fadeTextOpacity : parsed.fadeOpacity;
    return {
      color: normalizeColor(typeof parsed.color === 'string' ? parsed.color : null, fallback.color),
      doubleLineDistance: normalizePositiveNumber(String(parsed.doubleLineDistance ?? ''), fallback.doubleLineDistance),
      effect: normalizeEffect(typeof parsed.effect === 'string' ? parsed.effect : null, fallback.effect),
      fadeEnabled: typeof parsed.fadeEnabled === 'boolean' ? parsed.fadeEnabled : fallback.fadeEnabled,
      fadeOpacity: normalizeOpacity(String(parsed.fadeOpacity ?? ''), fallback.fadeOpacity),
      fadeTextOpacity: normalizeOpacity(String(parsed.fadeTextOpacity ?? legacyTextOpacity ?? ''), fallback.fadeTextOpacity),
      innerLineWidth: normalizeNonNegativeNumber(String(parsed.innerLineWidth ?? ''), fallback.innerLineWidth),
      innerScale: normalizePositiveNumber(String(parsed.innerScale ?? ''), fallback.innerScale),
      lineWidth: normalizeNonNegativeNumber(String(parsed.lineWidth ?? ''), fallback.lineWidth),
      outerLineWidth: normalizeNonNegativeNumber(String(parsed.outerLineWidth ?? ''), fallback.outerLineWidth),
      outerScale: normalizePositiveNumber(String(parsed.outerScale ?? ''), fallback.outerScale),
      scale: normalizePositiveNumber(String(parsed.scale ?? ''), fallback.scale),
      svg: typeof parsed.svg === 'string' ? parsed.svg : fallback.svg
    };
  } catch {
    return fallback;
  }
}

function normalizeBaseAppearance(value: string | null): NodeIconBaseAppearance {
  if (!value) return DEFAULT_NODE_ICON_BASE_APPEARANCE;
  try {
    const parsed = JSON.parse(value) as Partial<Record<keyof NodeIconBaseAppearance, unknown>>;
    return {
      color: normalizeColor(typeof parsed.color === 'string' ? parsed.color : null, DEFAULT_NODE_ICON_BASE_APPEARANCE.color),
      lineWidth: normalizeNonNegativeNumber(String(parsed.lineWidth ?? ''), DEFAULT_NODE_ICON_BASE_APPEARANCE.lineWidth),
      scale: normalizePositiveNumber(String(parsed.scale ?? ''), DEFAULT_NODE_ICON_BASE_APPEARANCE.scale)
    };
  } catch {
    return DEFAULT_NODE_ICON_BASE_APPEARANCE;
  }
}

export function getNodeIconBaseAppearance(kind: EditableIconKind): NodeIconBaseAppearance {
  return normalizeBaseAppearance(getWhitelistedLocalStorageItem(BASE_STORAGE_KEYS[kind]));
}

export function getNodeIconStateAppearance(
  state: NodeTreeRowIconState,
  kind?: Extract<NodeTreeRowIconKind, 'reading' | 'review'>
): NodeIconStateAppearance {
  const base = kind ? getNodeIconBaseAppearance(kind) : DEFAULT_NODE_ICON_BASE_APPEARANCE;
  const defaults = {
    ...getDefaultNodeIconStateAppearance(state),
    color: base.color,
    innerLineWidth: base.lineWidth,
    lineWidth: base.lineWidth,
    outerLineWidth: base.lineWidth,
    scale: base.scale
  };
  const legacyAppearance = {
    color: defaults.color,
    doubleLineDistance: defaults.doubleLineDistance,
    effect: defaults.effect,
    fadeEnabled: defaults.fadeEnabled,
    fadeOpacity: defaults.fadeOpacity,
    fadeTextOpacity: defaults.fadeTextOpacity,
    innerLineWidth: defaults.innerLineWidth,
    innerScale: defaults.innerScale,
    lineWidth: defaults.lineWidth,
    outerLineWidth: defaults.outerLineWidth,
    outerScale: defaults.outerScale,
    scale: defaults.scale,
    svg: defaults.svg
  };
  return kind ? normalizeAppearanceOverride(getWhitelistedLocalStorageItem(KIND_STORAGE_KEYS[state][kind]), legacyAppearance) : legacyAppearance;
}

export function getNodeIconKindStateAppearanceStorageKey(
  state: NodeTreeRowIconState,
  kind: Extract<NodeTreeRowIconKind, 'reading' | 'review'>
) {
  return KIND_STORAGE_KEYS[state][kind];
}

export function shouldFadeDismissedRowText(kind?: EditableIconKind) {
  const appearance = getNodeIconStateAppearance('dismissed', kind);
  return appearance.fadeEnabled;
}

export function getDismissedFadeOpacity(kind?: EditableIconKind) {
  return getNodeIconStateAppearance('dismissed', kind).fadeOpacity;
}

export function getDismissedFadeTextOpacity(kind?: EditableIconKind) {
  return getNodeIconStateAppearance('dismissed', kind).fadeTextOpacity;
}
