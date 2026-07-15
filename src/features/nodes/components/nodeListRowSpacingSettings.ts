import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';

import { DEFAULT_NAVIGATION_TITLE_FONT_SIZE, resolveNavigationMetaLineHeight, resolveNavigationTitleLineHeight } from './navigationTypographySettings';

export const DEFAULT_NODE_LIST_ROW_SPACING = 6;
const MIN_NODE_LIST_ROW_SPACING = 0;
const MAX_NODE_LIST_ROW_SPACING = 24;

function normalizeNodeListRowSpacing(value: string | null): number {
  if (value === null || value.trim() === '') {
    return DEFAULT_NODE_LIST_ROW_SPACING;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_NODE_LIST_ROW_SPACING;
  }
  return Math.max(MIN_NODE_LIST_ROW_SPACING, Math.min(MAX_NODE_LIST_ROW_SPACING, Math.round(parsed)));
}

export function getNodeListRowSpacing() {
  return normalizeNodeListRowSpacing(getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeListRowSpacing));
}

export function setNodeListRowSpacing(value: number) {
  const normalized = normalizeNodeListRowSpacing(String(value));
  if (normalized === DEFAULT_NODE_LIST_ROW_SPACING) {
    removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeListRowSpacing);
    return;
  }
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeListRowSpacing, String(normalized));
}

export function resolveNodeListRowGap(rowSpacing: number) {
  return Math.max(1, rowSpacing - 2);
}

export function resolveNodeTreeRowVirtualSize(rowSpacing: number, rowGap = 0, titleFontSize = DEFAULT_NAVIGATION_TITLE_FONT_SIZE) {
  return resolveNavigationTitleLineHeight(titleFontSize) + rowSpacing * 2 + rowGap;
}

export function resolveNodeTreeRowWithSecondaryVirtualSize(rowSpacing: number, titleFontSize: number, metaFontSize: number, rowGap = 0) {
  return resolveNodeTreeRowVirtualSize(rowSpacing, rowGap, titleFontSize) + resolveNavigationMetaLineHeight(metaFontSize);
}
