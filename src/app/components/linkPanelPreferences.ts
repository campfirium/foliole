import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../shared/platform/storage';

export interface LinkPanelSize {
  height: number;
  width: number;
}

const DEFAULT_WIDTH_RATIO = 0.5;
const DEFAULT_HEIGHT_RATIO = 0.8;
const MIN_HEIGHT_RATIO = 0.5;
const MIN_WIDTH_RATIO = 0.5;
const VIEWPORT_MARGIN = 16;
const MIN_HEIGHT_PX = 360;
const MIN_WIDTH_PX = 520;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getViewportWidth() {
  return typeof window === 'undefined' ? 1440 : window.innerWidth;
}

function getViewportHeight() {
  return typeof window === 'undefined' ? 900 : window.innerHeight;
}

function resolveWidthBounds() {
  const viewportWidth = getViewportWidth();
  const maxWidth = Math.max(320, viewportWidth - VIEWPORT_MARGIN * 2);
  const minWidth = Math.min(maxWidth, Math.max(MIN_WIDTH_PX, Math.floor(viewportWidth * MIN_WIDTH_RATIO)));
  return { maxWidth, minWidth };
}

function resolveHeightBounds() {
  const viewportHeight = getViewportHeight();
  const maxHeight = Math.max(280, viewportHeight - VIEWPORT_MARGIN * 2);
  const minHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT_PX, Math.floor(viewportHeight * MIN_HEIGHT_RATIO)));
  return { maxHeight, minHeight };
}

export function normalizeLinkPanelSize(size: LinkPanelSize): LinkPanelSize {
  const { maxWidth, minWidth } = resolveWidthBounds();
  const { maxHeight, minHeight } = resolveHeightBounds();
  return {
    height: clamp(Math.round(size.height), minHeight, maxHeight),
    width: clamp(Math.round(size.width), minWidth, maxWidth)
  };
}

export function getDefaultLinkPanelSize(): LinkPanelSize {
  return normalizeLinkPanelSize({
    height: Math.floor(getViewportHeight() * DEFAULT_HEIGHT_RATIO),
    width: Math.floor(getViewportWidth() * DEFAULT_WIDTH_RATIO)
  });
}

export function loadLinkPanelSize() {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.linkPanelSize);
  if (!raw) {
    return getDefaultLinkPanelSize();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LinkPanelSize>;
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
      return getDefaultLinkPanelSize();
    }
    return normalizeLinkPanelSize({ height: parsed.height, width: parsed.width });
  } catch {
    return getDefaultLinkPanelSize();
  }
}

export function saveLinkPanelSize(size: LinkPanelSize) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.linkPanelSize,
    JSON.stringify(normalizeLinkPanelSize(size))
  );
}
