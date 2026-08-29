export type RuntimeOperatingSystem = 'macos' | 'windows' | 'other';

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    platform?: string;
  };
}

export function getRuntimePlatformText() {
  if (typeof navigator === 'undefined') {
    return '';
  }
  const runtimeNavigator = navigator as NavigatorWithUserAgentData;
  return [
    runtimeNavigator.userAgentData?.platform,
    runtimeNavigator.platform,
    runtimeNavigator.userAgent
  ]
    .filter(Boolean)
    .join(' ');
}

export function resolveRuntimeOperatingSystem(platformText = getRuntimePlatformText()): RuntimeOperatingSystem {
  const normalized = platformText.toLowerCase();
  if (normalized.includes('mac') || normalized.includes('darwin')) {
    return 'macos';
  }
  if (normalized.includes('win')) {
    return 'windows';
  }
  return 'other';
}

export function usesMacShortcutProjection(platformText?: string) {
  return resolveRuntimeOperatingSystem(platformText) === 'macos';
}
