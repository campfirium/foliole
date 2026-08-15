export const BACKGROUND_UPDATE_REOPEN_ARG = '--foliole-background-update-reopen';

export function wasOpenedForBackgroundUpdate(
  argv: readonly string[] = process.argv,
  platform: NodeJS.Platform = process.platform
) {
  return platform === 'darwin' && argv.includes(BACKGROUND_UPDATE_REOPEN_ARG);
}

export function shouldShowInitialWindow(options: {
  argv?: readonly string[];
  capturePanelLaunchIntent: boolean;
  openedAtLogin: boolean;
  platform?: NodeJS.Platform;
}) {
  return !options.openedAtLogin
    && !wasOpenedForBackgroundUpdate(options.argv, options.platform)
    && !options.capturePanelLaunchIntent;
}
