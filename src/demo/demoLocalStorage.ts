import { WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

export const DEMO_STORAGE_KEY_PREFIX = 'foliole-demo-';
export const DEMO_PREVIEW_DAY_KEY = `${DEMO_STORAGE_KEY_PREFIX}preview-day-v1`;
export const DEMO_STARTED_AT_KEY = `${DEMO_STORAGE_KEY_PREFIX}started-at-v1`;
export const DEMO_SNAPSHOT_VERSION = 'demo-workspace-v1';
export const DEMO_CAPTURED_VERSION = 'demo:2026-06-25-guide-paragraph-blocks';

export function readDemoManualAdvanceDays() {
  const raw = window.localStorage.getItem(DEMO_PREVIEW_DAY_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function writeDemoManualAdvanceDays(day: number) {
  window.localStorage.setItem(DEMO_PREVIEW_DAY_KEY, String(Math.max(0, Math.floor(day))));
}

export const readDemoPreviewDay = readDemoManualAdvanceDays;
export const writeDemoPreviewDay = writeDemoManualAdvanceDays;

export function readOrCreateDemoStartedAt(now = new Date()) {
  const raw = window.localStorage.getItem(DEMO_STARTED_AT_KEY);
  if (raw && Number.isFinite(Date.parse(raw))) {
    return raw;
  }
  const startedAt = now.toISOString();
  window.localStorage.setItem(DEMO_STARTED_AT_KEY, startedAt);
  return startedAt;
}

export function clearDemoLocalStorage() {
  const keys = [WORKSPACE_STORAGE_KEY, DEMO_SNAPSHOT_VERSION];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(DEMO_STORAGE_KEY_PREFIX)) {
      keys.push(key);
    }
  }
  Array.from(new Set(keys)).forEach((key) => window.localStorage.removeItem(key));
}
