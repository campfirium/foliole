import { Capacitor } from '@capacitor/core';

export type CompanionRuntimeCapability =
  | { kind: 'web-preview'; platform: 'web' }
  | { kind: 'android-native'; platform: 'android' }
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

export function getCompanionRuntimeCapability(): CompanionRuntimeCapability {
  if (!Capacitor.isNativePlatform()) {
    return { kind: 'web-preview', platform: 'web' };
  }

  const platform = Capacitor.getPlatform();
  return platform === 'android'
    ? { kind: 'android-native', platform }
    : { kind: 'native-unavailable', platform };
}

export function requireAvailableCompanionRuntime(capability: string) {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind === 'native-unavailable') {
    throw new NativeCompanionCapabilityUnavailableError(capability, runtime.platform);
  }
  return runtime;
}
