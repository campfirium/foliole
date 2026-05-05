import { randomUUID } from 'node:crypto';

import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

const DESKTOP_DEVICE_ID_KEY = 'desktop_device_id';

function normalizeDeviceId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function loadDesktopDeviceId(): string | null {
  return normalizeDeviceId(loadJsonSetting(DESKTOP_DEVICE_ID_KEY));
}

export function loadOrCreateDesktopDeviceId(now = new Date().toISOString()): string {
  const existing = loadDesktopDeviceId();
  if (existing) {
    return existing;
  }
  const next = `desktop-${randomUUID()}`;
  saveJsonSetting(DESKTOP_DEVICE_ID_KEY, next, now);
  return next;
}
