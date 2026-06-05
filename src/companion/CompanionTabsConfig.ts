import {
  Activity,
  BookOpenText,
  FolderTree,
  GraduationCap,
  ListFilter,
  Search,
  Settings,
  SlidersHorizontal,
  Unplug
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { TranslationKey } from '../shared/localization/translations';

export type CompanionTabAction = 'review' | 'recent' | 'search' | 'more';
export type CompanionPrimaryTabId = 'browse' | 'learn' | 'search' | 'settings';
export type CompanionSecondaryDestinationId =
  | 'directory'
  | 'onlyReview'
  | 'sync'
  | 'tabs'
  | 'syncActivity'
  | 'syncConnection'
  | 'syncHandoff';

export type CompanionTabSlotId = CompanionPrimaryTabId | 'shortcut';

export type CompanionSecondaryDestination = {
  icon: LucideIcon;
  id: CompanionSecondaryDestinationId;
  labelKey: TranslationKey;
  parentTab: CompanionPrimaryTabId;
};

export type CompanionTabConfig = {
  orderedTabIds: CompanionTabSlotId[];
  shortcut: {
    destinationId: CompanionSecondaryDestinationId;
    enabled: boolean;
  };
};

export type CompanionResolvedTab = {
  action?: CompanionTabAction;
  destinationId?: CompanionSecondaryDestinationId;
  icon: LucideIcon;
  id: CompanionTabSlotId;
  labelKey: TranslationKey;
  parentAction: CompanionTabAction;
};

const PRIMARY_TABS: Record<CompanionPrimaryTabId, Omit<CompanionResolvedTab, 'id'>> = {
  browse: { action: 'recent', icon: BookOpenText, labelKey: 'companion.tabs.browse', parentAction: 'recent' },
  learn: { action: 'review', icon: GraduationCap, labelKey: 'companion.tabs.learn', parentAction: 'review' },
  search: { action: 'search', icon: Search, labelKey: 'companion.tabs.search', parentAction: 'search' },
  settings: { action: 'more', icon: Settings, labelKey: 'companion.tabs.settings', parentAction: 'more' }
};

const PRIMARY_ACTION_BY_TAB_ID: Record<CompanionPrimaryTabId, CompanionTabAction> = {
  browse: 'recent',
  learn: 'review',
  search: 'search',
  settings: 'more'
};

export const COMPANION_SECONDARY_DESTINATIONS: CompanionSecondaryDestination[] = [
  { icon: FolderTree, id: 'directory', labelKey: 'companion.tabs.shortcut.directory', parentTab: 'browse' },
  { icon: ListFilter, id: 'onlyReview', labelKey: 'companion.tabs.shortcut.onlyReview', parentTab: 'learn' },
  { icon: Settings, id: 'sync', labelKey: 'companion.tabs.shortcut.sync', parentTab: 'settings' },
  { icon: SlidersHorizontal, id: 'tabs', labelKey: 'companion.tabs.shortcut.tabs', parentTab: 'settings' },
  { icon: Activity, id: 'syncActivity', labelKey: 'companion.tabs.shortcut.syncActivity', parentTab: 'settings' },
  { icon: Unplug, id: 'syncConnection', labelKey: 'companion.tabs.shortcut.syncConnection', parentTab: 'settings' },
  { icon: Activity, id: 'syncHandoff', labelKey: 'companion.tabs.shortcut.syncHandoff', parentTab: 'settings' }
];

export const DEFAULT_COMPANION_TAB_CONFIG: CompanionTabConfig = {
  orderedTabIds: ['shortcut', 'browse', 'learn', 'search', 'settings'],
  shortcut: {
    destinationId: 'directory',
    enabled: true
  }
};

export function findCompanionSecondaryDestination(id: CompanionSecondaryDestinationId) {
  return COMPANION_SECONDARY_DESTINATIONS.find((destination) => destination.id === id) ?? null;
}

export function resolveCompanionTabs(config: CompanionTabConfig = DEFAULT_COMPANION_TAB_CONFIG): CompanionResolvedTab[] {
  const tabs: CompanionResolvedTab[] = [];
  for (const tabId of config.orderedTabIds) {
    if (tabId === 'shortcut') {
      if (!config.shortcut.enabled) continue;
      const destination = findCompanionSecondaryDestination(config.shortcut.destinationId);
      if (!destination) continue;
      tabs.push({
        destinationId: destination.id,
        icon: destination.icon,
        id: 'shortcut',
        labelKey: destination.labelKey,
        parentAction: PRIMARY_ACTION_BY_TAB_ID[destination.parentTab]
      });
      continue;
    }
    tabs.push({ id: tabId, ...PRIMARY_TABS[tabId] });
  }
  return tabs;
}
