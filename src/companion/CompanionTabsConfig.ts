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
  label: string;
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
  label: string;
  parentAction: CompanionTabAction;
};

const PRIMARY_TABS: Record<CompanionPrimaryTabId, Omit<CompanionResolvedTab, 'id'>> = {
  browse: { action: 'recent', icon: BookOpenText, label: 'Browse', parentAction: 'recent' },
  learn: { action: 'review', icon: GraduationCap, label: 'Learn', parentAction: 'review' },
  search: { action: 'search', icon: Search, label: 'Search', parentAction: 'search' },
  settings: { action: 'more', icon: Settings, label: 'Settings', parentAction: 'more' }
};

const PRIMARY_ACTION_BY_TAB_ID: Record<CompanionPrimaryTabId, CompanionTabAction> = {
  browse: 'recent',
  learn: 'review',
  search: 'search',
  settings: 'more'
};

export const COMPANION_SECONDARY_DESTINATIONS: CompanionSecondaryDestination[] = [
  { icon: FolderTree, id: 'directory', label: 'Directory', parentTab: 'browse' },
  { icon: ListFilter, id: 'onlyReview', label: 'Only Review', parentTab: 'learn' },
  { icon: Settings, id: 'sync', label: 'Sync', parentTab: 'settings' },
  { icon: SlidersHorizontal, id: 'tabs', label: 'Tabs', parentTab: 'settings' },
  { icon: Activity, id: 'syncActivity', label: 'Sync Activity', parentTab: 'settings' },
  { icon: Unplug, id: 'syncConnection', label: 'Sync Connection', parentTab: 'settings' },
  { icon: Activity, id: 'syncHandoff', label: 'Handoff reminders', parentTab: 'settings' }
];

export const DEFAULT_COMPANION_TAB_CONFIG: CompanionTabConfig = {
  orderedTabIds: ['browse', 'learn', 'search', 'settings', 'shortcut'],
  shortcut: {
    destinationId: 'directory',
    enabled: false
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
        label: destination.label,
        parentAction: PRIMARY_ACTION_BY_TAB_ID[destination.parentTab]
      });
      continue;
    }
    tabs.push({ id: tabId, ...PRIMARY_TABS[tabId] });
  }
  return tabs;
}
