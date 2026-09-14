const PLATFORM_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['android', 'Android'],
  ['darwin', 'macOS'],
  ['ios', 'iOS'],
  ['linux', 'Linux'],
  ['win32', 'Windows']
];

export function displaySyncGroupPlatform(value: string) {
  const platform = value.trim();
  const normalized = platform.toLowerCase();
  if (normalized.startsWith('windows 11')) return 'Windows 11';
  if (normalized.startsWith('windows')) return 'Windows';
  const match = PLATFORM_LABELS.find(([kind]) => normalized.includes(kind));
  return match?.[1] ?? platform;
}

export function resolveDesktopSyncGroupPlatform(platform: string, release: string) {
  if (platform !== 'win32') return displaySyncGroupPlatform(platform);
  const build = Number.parseInt(release.split('.')[2] ?? '', 10);
  return Number.isFinite(build) && build >= 22_000 ? 'Windows 11' : 'Windows';
}

export function isDesktopSyncGroupPlatform(value: string) {
  const platform = value.trim().toLowerCase();
  return platform === 'desktop'
    || platform.includes('darwin')
    || platform.includes('macos')
    || platform.includes('linux')
    || platform.includes('win32')
    || platform.startsWith('windows');
}

export function normalizeDesktopSyncGroupPlatform(value: string) {
  const platform = value.trim();
  const normalized = platform.toLowerCase();
  if (normalized === 'macos') return 'darwin';
  if (normalized.startsWith('windows')) return 'win32';
  return normalized || 'desktop';
}
