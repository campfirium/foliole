import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { parseLiteralUnion } from '../../../shared/lib/parseLiteralUnion';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';

export type WorkspaceRailSection = 'top' | 'bottom' | 'fixed';

export type WorkspaceRailItemSource = 'system' | 'user';

export interface WorkspaceRailItemConfig {
  id: string;
  commandId: string;
  section: WorkspaceRailSection;
  order: number;
  visible: boolean;
  source: WorkspaceRailItemSource;
  iconId?: string;
  labelOverride?: string;
  locked?: boolean;
}

export const DEFAULT_WORKSPACE_RAIL_ITEMS: WorkspaceRailItemConfig[] = [
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

const WORKSPACE_RAIL_SECTIONS: WorkspaceRailSection[] = ['top', 'bottom', 'fixed'];

export const WORKSPACE_RAIL_COMMAND_LABELS: Record<string, string> = {
  [APP_COMMAND_IDS.importSingleFile]: 'Import',
  [APP_COMMAND_IDS.clipboardImport]: 'Import Clipboard',
  [APP_COMMAND_IDS.startStudyMode]: 'Study',
  [APP_COMMAND_IDS.openSettings]: 'Settings'
};

export function getWorkspaceRailItemLabel(item: WorkspaceRailItemConfig) {
  return item.labelOverride ?? WORKSPACE_RAIL_COMMAND_LABELS[item.commandId] ?? item.commandId;
}

function cloneItem(item: WorkspaceRailItemConfig): WorkspaceRailItemConfig {
  return { ...item };
}

function defaultItemById(id: string) {
  return DEFAULT_WORKSPACE_RAIL_ITEMS.find((item) => item.id === id);
}

function isWorkspaceRailSection(value: string): value is WorkspaceRailSection {
  return parseLiteralUnion(value, WORKSPACE_RAIL_SECTIONS) !== null;
}

function isRetiredRailCommand(commandId: string) {
  return commandId === APP_COMMAND_IDS.openImportManagement;
}

function isValidPersistedItem(item: WorkspaceRailItemConfig) {
  return Boolean(item.id && item.commandId && !isRetiredRailCommand(item.commandId) && isWorkspaceRailSection(item.section));
}

function normalizeDefaultItem(item: WorkspaceRailItemConfig) {
  const defaultItem = defaultItemById(item.id);
  if (!defaultItem) {
    return item;
  }

  return {
    ...defaultItem,
    section: defaultItem.locked ? defaultItem.section : item.section,
    order: item.order,
    visible: defaultItem.locked ? true : item.visible,
    ...((item.iconId ?? defaultItem.iconId) ? { iconId: item.iconId ?? defaultItem.iconId } : {}),
    ...(item.labelOverride ? { labelOverride: item.labelOverride } : {}),
    ...(defaultItem.locked !== undefined ? { locked: defaultItem.locked } : {})
  };
}

function normalizeSection(items: WorkspaceRailItemConfig[], section: WorkspaceRailSection) {
  return items
    .filter((item) => item.section === section)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((item, order) => ({ ...item, order }));
}

export function normalizeWorkspaceRailItems(items: WorkspaceRailItemConfig[] = DEFAULT_WORKSPACE_RAIL_ITEMS) {
  const seen = new Set<string>();
  const persisted = items.filter(isValidPersistedItem);
  const byId = new Map(persisted.map((item) => [item.id, item]));

  const systemItems = DEFAULT_WORKSPACE_RAIL_ITEMS.map((defaultItem) => {
    seen.add(defaultItem.id);
    return normalizeDefaultItem(byId.get(defaultItem.id) ?? defaultItem);
  });

  const userItems = persisted.filter((item) => {
    if (seen.has(item.id) || item.source !== 'user') {
      return false;
    }
    seen.add(item.id);
    return true;
  });

  return WORKSPACE_RAIL_SECTIONS.flatMap((section) => normalizeSection([...systemItems, ...userItems], section));
}

export function resetWorkspaceRailItems() {
  return normalizeWorkspaceRailItems(DEFAULT_WORKSPACE_RAIL_ITEMS.map(cloneItem));
}

export function getWorkspaceRailSectionItems(items: WorkspaceRailItemConfig[], section: WorkspaceRailSection) {
  return normalizeWorkspaceRailItems(items).filter((item) => item.section === section);
}

export function toggleWorkspaceRailItemVisibility(
  items: WorkspaceRailItemConfig[],
  itemId: string,
  visible: boolean
) {
  return normalizeWorkspaceRailItems(
    items.map((item) => (item.id === itemId && !item.locked ? { ...item, visible } : item))
  );
}

export function removeWorkspaceRailItem(items: WorkspaceRailItemConfig[], itemId: string) {
  const target = normalizeWorkspaceRailItems(items).find((item) => item.id === itemId);
  if (!target || target.locked) {
    return normalizeWorkspaceRailItems(items);
  }
  if (target.source === 'system') {
    return toggleWorkspaceRailItemVisibility(items, itemId, false);
  }
  return normalizeWorkspaceRailItems(items.filter((item) => item.id !== itemId));
}

function createUserRailItemId(commandId: string) {
  return `user.${commandId.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

export function addWorkspaceRailItem(
  items: WorkspaceRailItemConfig[],
  command: { commandId: string; iconId?: string; label: string },
  section: Exclude<WorkspaceRailSection, 'fixed'> = 'top'
) {
  const normalized = normalizeWorkspaceRailItems(items);
  const existing = normalized.find((item) => item.commandId === command.commandId && !item.locked);
  if (existing) {
    return normalizeWorkspaceRailItems(
      normalized.map((item) =>
        item.id === existing.id
          ? {
              ...item,
              ...((command.iconId ?? item.iconId) ? { iconId: command.iconId ?? item.iconId } : {}),
              labelOverride: command.label,
              section,
              visible: true
            }
          : item
      )
    );
  }

  const sectionOrder = normalized.filter((item) => item.section === section).length;
  return normalizeWorkspaceRailItems([
    ...normalized,
    {
      id: createUserRailItemId(command.commandId),
      commandId: command.commandId,
      ...(command.iconId ? { iconId: command.iconId } : {}),
      labelOverride: command.label,
      order: sectionOrder,
      section,
      source: 'user',
      visible: true
    }
  ]);
}

export function moveWorkspaceRailItem(
  items: WorkspaceRailItemConfig[],
  itemId: string,
  section: Exclude<WorkspaceRailSection, 'fixed'>,
  order: number
) {
  const normalized = normalizeWorkspaceRailItems(items);
  const target = normalized.find((item) => item.id === itemId);
  if (!target || target.locked) {
    return normalized;
  }

  const nextOrder = Number.isFinite(order) ? Math.max(0, Math.floor(order)) : 0;
  const otherItems = normalized.filter((item) => item.id !== itemId && item.section !== section);
  const sectionItems = normalized.filter((item) => item.id !== itemId && item.section === section);
  const insertAt = Math.min(nextOrder, sectionItems.length);
  const reorderedSectionItems = [
    ...sectionItems.slice(0, insertAt),
    { ...target, section },
    ...sectionItems.slice(insertAt)
  ].map((item, index) => ({ ...item, order: index }));

  return normalizeWorkspaceRailItems([...otherItems, ...reorderedSectionItems]);
}

export function loadWorkspaceRailItems() {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceRailItems);
  if (!raw) {
    return resetWorkspaceRailItems();
  }
  try {
    const parsed = JSON.parse(raw);
    return normalizeWorkspaceRailItems(Array.isArray(parsed) ? parsed : DEFAULT_WORKSPACE_RAIL_ITEMS);
  } catch {
    return resetWorkspaceRailItems();
  }
}

export function saveWorkspaceRailItems(items: WorkspaceRailItemConfig[]) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.workspaceRailItems,
    JSON.stringify(normalizeWorkspaceRailItems(items))
  );
}
