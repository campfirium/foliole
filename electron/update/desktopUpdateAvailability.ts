interface DesktopUpdateAvailabilityInput {
  isMas: boolean;
  isPackaged: boolean;
  isWindowsStore: boolean;
  platform: NodeJS.Platform;
}

export function isDesktopUpdateApplicable(input: DesktopUpdateAvailabilityInput) {
  return input.isPackaged &&
    (input.platform === 'darwin' || input.platform === 'win32') &&
    !input.isMas &&
    !input.isWindowsStore;
}
