import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { isInternalFeaturePreviewBuild } from '../../../shared/config/featurePreviews';
import { isDesktopRuntime } from '../../../shared/platform/runtime';

import type { WorkspaceRailItemConfig } from './workspaceRailSettings';

const SUPER_MEMO_RAIL_ITEM_ID = 'system.import-supermemo';

export function isWorkspaceRailItemAvailable(item: WorkspaceRailItemConfig) {
  if (item.commandId === APP_COMMAND_IDS.openLocalFile) return isDesktopRuntime();
  return item.id !== SUPER_MEMO_RAIL_ITEM_ID || (isInternalFeaturePreviewBuild() && isDesktopRuntime());
}

export const DEFAULT_WORKSPACE_RAIL_ITEMS: WorkspaceRailItemConfig[] = [
  {
    id: 'system.open-file',
    commandId: APP_COMMAND_IDS.openLocalFile,
    section: 'top',
    order: -1,
    visible: true,
    source: 'system',
    iconId: 'FolderOpen'
  },
  {
    id: 'system.import-file',
    commandId: APP_COMMAND_IDS.importSingleFile,
    section: 'top',
    order: 0,
    visible: true,
    source: 'system',
    iconId: 'FileUp'
  },
  {
    id: 'system.import-clipboard',
    commandId: APP_COMMAND_IDS.clipboardImport,
    section: 'top',
    order: 1,
    visible: true,
    source: 'system',
    iconId: 'ClipboardPlus'
  },
  {
    id: 'system.immersive-reading',
    commandId: APP_COMMAND_IDS.toggleImmersiveMode,
    section: 'top',
    order: 2,
    visible: true,
    source: 'system',
    iconId: 'BookOpen'
  },
  {
    id: 'system.review-statistics',
    commandId: APP_COMMAND_IDS.openReviewCalendar,
    section: 'top',
    order: 3,
    visible: true,
    source: 'system',
    iconId: 'ChartNoAxesColumnIncreasing',
    labelOverride: 'desktop.command.openReviewCalendar'
  },
  {
    id: 'system.workspace-search',
    commandId: APP_COMMAND_IDS.openWorkspaceSearch,
    section: 'top',
    order: 4,
    visible: true,
    source: 'system',
    iconId: 'Search'
  },
  {
    id: 'system.command-palette',
    commandId: APP_COMMAND_IDS.openCommandPalette,
    section: 'top',
    order: 5,
    visible: true,
    source: 'system',
    iconId: 'SquareChevronRight'
  },
  {
    id: 'system.material-history',
    commandId: APP_COMMAND_IDS.openMaterialHistory,
    section: 'top',
    order: 6,
    visible: true,
    source: 'system',
    iconId: 'Clock',
    labelOverride: 'desktop.command.openMaterialHistory'
  },
  {
    id: SUPER_MEMO_RAIL_ITEM_ID,
    commandId: APP_COMMAND_IDS.importSuperMemo,
    section: 'top',
    order: 7,
    visible: true,
    source: 'system',
    iconId: 'DatabaseBackup',
    labelOverride: 'desktop.command.importSuperMemo'
  },
  {
    id: 'system.feedback',
    commandId: APP_COMMAND_IDS.sendFeedback,
    section: 'bottom',
    order: 0,
    visible: true,
    source: 'system',
    iconId: 'MessageSquareWarning'
  },
  {
    id: 'system.appearance-mode',
    commandId: APP_COMMAND_IDS.toggleBaseColorMode,
    section: 'bottom',
    order: 1,
    visible: true,
    source: 'system',
    iconId: 'Sun',
    labelOverride: 'desktop.command.cycleAppearanceMode'
  },
  {
    id: 'fixed.review',
    commandId: APP_COMMAND_IDS.startStudyMode,
    section: 'fixed',
    order: 0,
    visible: true,
    source: 'system',
    iconId: 'GraduationCap',
    locked: true
  },
  {
    id: 'fixed.settings',
    commandId: APP_COMMAND_IDS.openSettings,
    section: 'fixed',
    order: 1,
    visible: true,
    source: 'system',
    iconId: 'Settings',
    locked: true
  }
];

export const WORKSPACE_RAIL_COMMAND_LABELS: Record<string, string> = {
  [APP_COMMAND_IDS.openWorkspaceSearch]: 'Search',
  [APP_COMMAND_IDS.openCommandPalette]: 'Command Palette',
  [APP_COMMAND_IDS.importSingleFile]: 'Import',
  [APP_COMMAND_IDS.clipboardImport]: 'Import Clipboard',
  [APP_COMMAND_IDS.toggleImmersiveMode]: 'Reading Mode',
  [APP_COMMAND_IDS.sendFeedback]: 'Send Feedback',
  [APP_COMMAND_IDS.toggleBaseColorMode]: 'Appearance Mode',
  [APP_COMMAND_IDS.startStudyMode]: 'Study',
  [APP_COMMAND_IDS.openReviewCalendar]: 'Open review statistics',
  [APP_COMMAND_IDS.openSettings]: 'Settings'
};
