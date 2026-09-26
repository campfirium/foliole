const PLATFORM_NAMES: Record<string, string> = {
  darwin: 'macOS', linux: 'Linux', win32: 'Windows'
};

export function watchedFolderPlatformName(platform: string) {
  return PLATFORM_NAMES[platform] ?? platform;
}
