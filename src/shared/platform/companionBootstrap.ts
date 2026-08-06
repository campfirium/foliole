import { registerPlugin } from '@capacitor/core';

import type { NativeCompanionBootstrapState } from '../../../lib/platform/nativeCompanionContract';

import { getCompanionRuntimeCapability, requireAvailableCompanionRuntime } from './companionRuntimeCapabilities';

const WEB_DEVICE_ID_KEY = 'foliole-companion-web-device-id';
const WEB_PREVIEW_DATABASE_NAME = 'foliole-companion-preview.db';

interface CompanionBootstrapPlugin {
  loadBootstrap(): Promise<NativeCompanionBootstrapState>;
}

const FolioleCompanionBootstrap = registerPlugin<CompanionBootstrapPlugin>('FolioleCompanionBootstrap');

function normalizeCompanionBootstrapState(value: unknown): NativeCompanionBootstrapState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const rawState = value as Record<string, unknown>;
  const { booted_at, database_path, database_ready, device_id, device_name, runtime_kind } = rawState;
  if (typeof booted_at !== 'string' || !booted_at.trim()) {
    return null;
  }
  if (database_path !== undefined && database_path !== null && typeof database_path !== 'string') {
    return null;
  }
  if (typeof database_ready !== 'boolean') {
    return null;
  }
  if (typeof device_id !== 'string' || !device_id.trim()) {
    return null;
  }
  if (runtime_kind !== 'android-capacitor' && runtime_kind !== 'ios-capacitor' && runtime_kind !== 'web-preview') {
    return null;
  }

  return {
    booted_at,
    database_path: typeof database_path === 'string' ? database_path : null,
    database_ready,
    device_id,
    device_name: typeof device_name === 'string' && device_name.trim() ? device_name.trim() : null,
    runtime_kind
  };
}

function readStoredWebPreviewDeviceId() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(WEB_DEVICE_ID_KEY);
    return stored && stored.trim() ? stored : null;
  } catch {
    return null;
  }
}

function createWebPreviewDeviceId() {
  const existing = readStoredWebPreviewDeviceId();
  if (existing) {
    return existing;
  }

  const nextDeviceId = `web-preview-${crypto.randomUUID()}`;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(WEB_DEVICE_ID_KEY, nextDeviceId);
    } catch {
      return nextDeviceId;
    }
  }
  return nextDeviceId;
}

function createWebPreviewBootstrapState(): NativeCompanionBootstrapState {
  return {
    booted_at: new Date().toISOString(),
    database_path: WEB_PREVIEW_DATABASE_NAME,
    database_ready: false,
    device_id: createWebPreviewDeviceId(),
    device_name: 'Web preview',
    runtime_kind: 'web-preview'
  };
}

export function isNativeCompanionRuntime() {
  const runtime = getCompanionRuntimeCapability();
  return runtime.kind !== 'web-preview' && runtime.kind !== 'native-unavailable';
}

export async function loadCompanionBootstrapState(): Promise<NativeCompanionBootstrapState> {
  const runtime = requireAvailableCompanionRuntime('bootstrap');
  if (runtime.kind === 'web-preview') {
    return createWebPreviewBootstrapState();
  }

  const result = normalizeCompanionBootstrapState(await FolioleCompanionBootstrap.loadBootstrap());
  if (!result) {
    throw new Error('Native companion bootstrap returned an invalid payload.');
  }
  if (runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') return result;
  const { initializeIosCompanionDatabase } = await import('./companion/runtime/iosCompanionDatabaseBootstrap');
  return initializeIosCompanionDatabase(result);
}

export { normalizeCompanionBootstrapState };
