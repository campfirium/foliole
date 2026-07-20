import { Capacitor } from '@capacitor/core';

export type CompanionRuntimeCapability =
  | { kind: 'web-preview'; platform: 'web' }
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

const IOS_NATIVE_CAPABILITIES = new Set([
  'attachment-resource-sync',
  'bootstrap',
  'content-blob-sync',
  'external-document-directory',
  'external-document-read',
  'external-document-search',
  'pairing-runtime',
  'pdf-page-text',
  'reading-write',
  'learning-syncback',
  'review-write',
  'sync-pack-apply',
  'sync-diagnostics',
  'sync-object-read',
  'setting-write',
  'topic-search',
  'view-state-write'
]);

export function getCompanionRuntimeCapability(): CompanionRuntimeCapability {
  if (!Capacitor.isNativePlatform()) {
    return { kind: 'web-preview', platform: 'web' };
  }

  const platform = Capacitor.getPlatform();
  if (platform === 'android') return { kind: 'android-native', platform };
  if (platform === 'ios') return { kind: 'ios-native', platform };
  return { kind: 'native-unavailable', platform };
}

export function requireAvailableCompanionRuntime(capability: string) {
  const runtime = getCompanionRuntimeCapability();
  const iosCapabilityUnavailable = runtime.kind === 'ios-native' && !IOS_NATIVE_CAPABILITIES.has(capability);
  if (runtime.kind === 'native-unavailable' || iosCapabilityUnavailable) {
    throw new NativeCompanionCapabilityUnavailableError(capability, runtime.platform);
  }
  return runtime;
}
