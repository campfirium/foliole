import { APP_COMMAND_IDS } from '../../shared/commands/ids';

export const HELP_PALETTE_COMMANDS = [
  { id: APP_COMMAND_IDS.checkForUpdates, title: 'Check for Updates', section: 'Help', keywords: ['release', 'version'] },
  { id: APP_COMMAND_IDS.openLatestRelease, title: 'Open Releases', section: 'Help', keywords: ['download', 'version'] },
  { id: APP_COMMAND_IDS.openGitHubRepository, title: 'Open GitHub Repository', section: 'Help', keywords: ['github', 'source'] },
  { id: APP_COMMAND_IDS.openGitHubIssues, title: 'Report an Issue', section: 'Help', keywords: ['github', 'bug', 'feedback'] },
  { id: APP_COMMAND_IDS.openGitHubDiscussions, title: 'Open Discussions', section: 'Help', keywords: ['github', 'feedback'] },
  { id: APP_COMMAND_IDS.openYouTubePlaylist, title: 'Open YouTube', section: 'Help', keywords: ['youtube', 'video'] }
];

const HELP_COMMAND_IDS = new Set<string>(HELP_PALETTE_COMMANDS.map((command) => command.id));

export function isHelpPaletteCommand(id: string) {
  return HELP_COMMAND_IDS.has(id);
}
