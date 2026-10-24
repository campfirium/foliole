import { Capacitor } from '@capacitor/core';

// Capacitor custom platform name of the dev-only browser preview host (a local database, no native host).
export const COMPANION_BROWSER_PREVIEW_PLATFORM = 'foliole-browser-preview';

export type CompanionRuntimeCapability =
  | { kind: 'web-preview'; platform: 'web' }
  | { kind: 'browser-preview'; platform: typeof COMPANION_BROWSER_PREVIEW_PLATFORM }
  | { kind: 'android-native'; platform: 'android' }
  | { kind: 'ios-native'; platform: 'ios' }
  | { kind: 'native-unavailable'; platform: string };

export class NativeCompanionCapabilityUnavailableError extends Error {
  readonly code = 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE';

  constructor(
    readonly capability: string,
    readonly platform: string
  ) {
    super(`Native companion capability "${capability}" is unavailable on platform "${platform}".`);
    this.name = 'NativeCompanionCapabilityUnavailableError';
  }
}

export const COMPANION_CAPABILITY_NAMES = [
  'attachment-resource-sync',
  'attachment-maintenance',
  'remote-image-import',
  'bootstrap',
  'external-document-directory',
  'external-document-read',
  'external-document-search',
  'node-version-write',
  'open-state-write',
  'sync-group-provider',
  'pdf-page-text',
  'reading-write',
  'syncback',
  'review-write',
  'share-inbox',
  'sync-pack-apply',
  'sync-diagnostics',
  'sync-object-read',
  'setting-write',
  'sync-group-store',
  'sync-participation',
  'sync-trigger',
  'topic-search',
  'view-state-write',
  'native-runtime'
] as const;

export type CompanionCapabilityName = typeof COMPANION_CAPABILITY_NAMES[number];
const KNOWN_CAPABILITIES: ReadonlySet<string> = new Set(COMPANION_CAPABILITY_NAMES);

export function getCompanionRuntimeCapability(): CompanionRuntimeCapability {
  if (!Capacitor.isNativePlatform()) {
    return { kind: 'web-preview', platform: 'web' };
  }

  const platform = Capacitor.getPlatform();
  if (platform === 'android') return { kind: 'android-native', platform };
  if (platform === 'ios') return { kind: 'ios-native', platform };
  if (platform === COMPANION_BROWSER_PREVIEW_PLATFORM) return { kind: 'browser-preview', platform };
  return { kind: 'native-unavailable', platform };
}

export function isCompanionNativeHost(runtime = getCompanionRuntimeCapability()) {
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

// Local database reads and writes need an open companion database, not a native host.
export function hasCompanionLocalDatabase(runtime: CompanionRuntimeCapability) {
  return isCompanionNativeHost(runtime) || runtime.kind === 'browser-preview';
}

export function isCompanionRuntimeCapabilityAvailable(capability: string) {
  if (!KNOWN_CAPABILITIES.has(capability)) return false;
  const runtime = getCompanionRuntimeCapability();
  return runtime.kind !== 'native-unavailable'
    && !(runtime.kind === 'ios-native' && capability === 'native-runtime');
}

export function requireAvailableCompanionRuntime(capability: string) {
  const runtime = getCompanionRuntimeCapability();
  if (!isCompanionRuntimeCapabilityAvailable(capability)) {
    throw new NativeCompanionCapabilityUnavailableError(capability, runtime.platform);
  }
  return runtime;
}

// Declaration support does not imply that a particular native plugin is installed.
export function requireCompanionNativePlugin(capability: CompanionCapabilityName, pluginName: string) {
  const runtime = requireAvailableCompanionRuntime(capability);
  if (runtime.kind === 'web-preview' || !Capacitor.isPluginAvailable(pluginName)) {
    throw new NativeCompanionCapabilityUnavailableError(capability, runtime.platform);
  }
  return runtime;
}
