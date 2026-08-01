interface DesktopUpdateAvailabilityInput {
  buildChannel: 'github' | 'internal' | 'mas' | null;
  isPackaged: boolean;
  isWindowsStore: boolean;
  platform: NodeJS.Platform;
}

export function isDesktopUpdateApplicable(input: DesktopUpdateAvailabilityInput) {
  return input.isPackaged &&
    input.buildChannel === 'github' &&
    (input.platform === 'darwin' || input.platform === 'win32') &&
    !input.isWindowsStore;
}
