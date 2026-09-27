import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';

export interface AnnotationPanelPreference {
  x: number | null;
  width: number;
  height: number;
}

export interface PanelViewport {
  width: number;
  height: number;
}

const DEFAULT_PREFERENCE: AnnotationPanelPreference = { x: null, width: 278, height: 178 };
const EDGE_GAP = 8;

export function readAnnotationPanelPreference(): AnnotationPanelPreference {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.annotationPanelPlacement);
  if (!raw) return { ...DEFAULT_PREFERENCE };
  try {
    const parsed = JSON.parse(raw) as Partial<AnnotationPanelPreference>;
    return {
      x: typeof parsed.x === 'number' && Number.isFinite(parsed.x) ? parsed.x : null,
      width: validSize(parsed.width, DEFAULT_PREFERENCE.width, 190),
      height: validSize(parsed.height, DEFAULT_PREFERENCE.height, 150)
    };
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}

function validSize(value: unknown, fallback: number, minimum: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(value, minimum) : fallback;
}

export function saveAnnotationPanelPreference(preference: AnnotationPanelPreference) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.annotationPanelPlacement, JSON.stringify(preference));
}

export function panelViewport(): PanelViewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function clampPanelRect(
  rect: { x: number; y: number; width: number; height: number },
  viewport: PanelViewport
) {
  const gapX = Math.min(EDGE_GAP, viewport.width / 2);
  const gapY = Math.min(EDGE_GAP, viewport.height / 2);
  const width = Math.min(rect.width, Math.max(0, viewport.width - gapX * 2));
  const height = Math.min(rect.height, Math.max(0, viewport.height - gapY * 2));
  return {
    x: Math.max(gapX, Math.min(rect.x, viewport.width - width - gapX)),
    y: Math.max(gapY, Math.min(rect.y, viewport.height - height - gapY)),
    width,
    height
  };
}
