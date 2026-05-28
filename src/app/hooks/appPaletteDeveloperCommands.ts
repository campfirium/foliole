import { APP_COMMAND_IDS } from '../../shared/commands/ids';

export const DEVELOPER_PALETTE_COMMANDS = [
  {
    id: APP_COMMAND_IDS.resetImportData,
    title: 'DEV Reset Import Data',
    section: 'Developer',
    keywords: ['dev', 'debug', 'import', 'reset', 'clear', 'records']
  },
  {
    id: APP_COMMAND_IDS.reimportSelectedTopic,
    title: 'Dev: Re-import Selected Topic',
    section: 'Developer',
    keywords: ['dev', 'debug', 'import', 'reimport', 'topic', 'removed']
  },
  {
    id: APP_COMMAND_IDS.openPerformancePanel,
    title: 'DEV Open Performance Panel',
    section: 'Developer',
    keywords: ['dev', 'debug', 'performance', 'timing', 'memory', 'cache']
  },
  {
    id: APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence,
    title: 'DEV Enable Review Status Bar Memory',
    section: 'Developer',
    keywords: ['dev', 'debug', 'review', 'status', 'bar', 'persist', 'memory']
  }
];

export function resolveDeveloperPaletteTitle(id: string, options: { isDevReviewStatusBarPersistenceEnabled: boolean }) {
  if (id !== APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence) {
    return null;
  }
  return options.isDevReviewStatusBarPersistenceEnabled
    ? 'DEV Disable Review Status Bar Memory'
    : 'DEV Enable Review Status Bar Memory';
}

export function isDeveloperCommandEnabled(
  id: string,
  options: {
    canReimportSelectedTopic: boolean;
    canResetImportData: boolean;
    canToggleDevReviewStatusBarPersistence: boolean;
  }
) {
  if (id === APP_COMMAND_IDS.resetImportData) {
    return options.canResetImportData;
  }
  if (id === APP_COMMAND_IDS.reimportSelectedTopic) {
    return options.canReimportSelectedTopic;
  }
  if (id === APP_COMMAND_IDS.openPerformancePanel) {
    return true;
  }
  if (id === APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence) {
    return options.canToggleDevReviewStatusBarPersistence;
  }
  return null;
}
