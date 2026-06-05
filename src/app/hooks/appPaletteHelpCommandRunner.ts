export interface PaletteHelpCommandRunnerArgs {
  checkForUpdates: () => Promise<void>;
  openGitHubDiscussions: () => Promise<void>;
  openGitHubIssues: () => Promise<void>;
  openGitHubRepository: () => Promise<void>;
  openLatestRelease: () => Promise<void>;
  openYouTubePlaylist: () => Promise<void>;
}

export function createPaletteHelpCommandActions(args: PaletteHelpCommandRunnerArgs) {
  return {
    checkForUpdates: () => void args.checkForUpdates(),
    openGitHubDiscussions: () => void args.openGitHubDiscussions(),
    openGitHubIssues: () => void args.openGitHubIssues(),
    openGitHubRepository: () => void args.openGitHubRepository(),
    openLatestRelease: () => void args.openLatestRelease(),
    openYouTubePlaylist: () => void args.openYouTubePlaylist()
  };
}
