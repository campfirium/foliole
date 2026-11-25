import { DESKTOP_GLOBAL_CAPTURE_ACTION } from '../../../shared/commands/desktopGlobalCaptureAction';
import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { parseLiteralUnion } from '../../../shared/lib/parseLiteralUnion';
import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate, type TranslationKey } from '../../../shared/localization/translations';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import { normalizeWorkspaceRailCommandId } from './workspaceRailCommandIds';
import { DEFAULT_WORKSPACE_RAIL_ITEMS, isWorkspaceRailItemAvailable, WORKSPACE_RAIL_COMMAND_LABELS } from './workspaceRailDefaults';

export type WorkspaceRailSection = 'top' | 'bottom' | 'fixed';

type WorkspaceRailItemSource = 'system' | 'user';

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

const WORKSPACE_RAIL_SECTIONS: WorkspaceRailSection[] = ['top', 'bottom', 'fixed'];
const RETIRED_IMPORT_MANAGEMENT_COMMAND_ID = 'import.openManagement';
const WORKSPACE_RAIL_COMMAND_LABEL_KEYS: Partial<Record<string, TranslationKey>> = {
  [APP_COMMAND_IDS.openLocalFile]: 'desktop.command.openFile',
  [APP_COMMAND_IDS.importSingleFile]: 'settings.rail.item.import',
  [APP_COMMAND_IDS.clipboardImport]: 'settings.rail.item.importClipboard',
  [DESKTOP_GLOBAL_CAPTURE_ACTION.id]: DESKTOP_GLOBAL_CAPTURE_ACTION.labelKey,
  [APP_COMMAND_IDS.toggleImmersiveMode]: 'settings.rail.item.readingMode',
  [APP_COMMAND_IDS.openWorkspaceSearch]: 'desktop.command.openWorkspaceSearch',
  [APP_COMMAND_IDS.openCommandPalette]: 'desktop.command.openCommandPalette',
  [APP_COMMAND_IDS.sendFeedback]: 'settings.rail.item.feedback',
  [APP_COMMAND_IDS.startStudyMode]: 'settings.rail.item.study',
  [APP_COMMAND_IDS.openSettings]: 'settings.rail.item.settings'
};

export { DEFAULT_WORKSPACE_RAIL_ITEMS };
type RailLabelTranslator = (key: TranslationKey) => string;

function translateRailLabel(key: TranslationKey, t?: RailLabelTranslator) {
  return typeof t === 'function' ? t(key) : translate(getStoredAppLocale(), key);
}

function resolveRailLabelOverride(labelOverride: string | undefined, t?: RailLabelTranslator) {
  if (!labelOverride) return undefined;
  const normalizedLabelOverride = labelOverride.trim();
  if (normalizedLabelOverride.startsWith('desktop.command.')) {
    return translateRailLabel(normalizedLabelOverride as TranslationKey, t);
  }
  return normalizedLabelOverride;
}

export function getWorkspaceRailItemLabel(item: WorkspaceRailItemConfig, t?: RailLabelTranslator) {
  const commandId = normalizeWorkspaceRailCommandId(item.commandId);
  const translationKey = WORKSPACE_RAIL_COMMAND_LABEL_KEYS[commandId];
  return (
    resolveRailLabelOverride(item.labelOverride, t) ??
    (translationKey ? translateRailLabel(translationKey, t) : undefined) ??
    WORKSPACE_RAIL_COMMAND_LABELS[commandId] ??
    commandId
  );
}

function defaultItemById(id: string) {
  return DEFAULT_WORKSPACE_RAIL_ITEMS.find((item) => item.id === id);
}

function isWorkspaceRailSection(value: string): value is WorkspaceRailSection {
  return parseLiteralUnion(value, WORKSPACE_RAIL_SECTIONS) !== null;
}

function isRetiredRailCommand(commandId: string) {
  return commandId === RETIRED_IMPORT_MANAGEMENT_COMMAND_ID;
}

function isValidPersistedItem(item: WorkspaceRailItemConfig) {
  const commandId = normalizeWorkspaceRailCommandId(item.commandId);
  return Boolean(item.id && commandId && !isRetiredRailCommand(commandId) && isWorkspaceRailSection(item.section));
}

function normalizeDefaultItem(item: WorkspaceRailItemConfig) {
  const normalizedCommandId = normalizeWorkspaceRailCommandId(item.commandId);
  const normalizedItem = normalizedCommandId === item.commandId ? item : { ...item, commandId: normalizedCommandId };
  const defaultItem = defaultItemById(normalizedItem.id);
  if (!defaultItem) {
    return normalizedItem;
  }

  return {
    ...defaultItem,
    section: defaultItem.locked ? defaultItem.section : normalizedItem.section,
    order: normalizedItem.order,
    visible: defaultItem.locked ? true : normalizedItem.visible,
    ...(defaultItem.iconId ? { iconId: defaultItem.iconId } : {}),
    ...(normalizedItem.labelOverride ? { labelOverride: normalizedItem.labelOverride } : {}),
    ...(defaultItem.locked !== undefined ? { locked: defaultItem.locked } : {})
  };
}

function normalizeSection(items: WorkspaceRailItemConfig[], section: WorkspaceRailSection, placeNewHistory: boolean) {
  const ordered = items
    .filter((item) => item.section === section)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  if (section === 'top' && placeNewHistory) {
    const publish = ordered.find((item) => item.commandId === APP_COMMAND_IDS.publishToDiscourse && item.visible);
    const historyIndex = ordered.findIndex((item) => item.id === 'system.material-history');
    if (publish && historyIndex >= 0) {
      const [history] = ordered.splice(historyIndex, 1);
      ordered.splice(ordered.indexOf(publish) + 1, 0, history!);
    }
  }
  return ordered.map((item, order) => ({ ...item, order }));
}

export function normalizeWorkspaceRailItems(items: WorkspaceRailItemConfig[] = []) {
  const seen = new Set<string>();
  const persisted = items
    .filter(isValidPersistedItem)
    .map((item) => ({ ...item, commandId: normalizeWorkspaceRailCommandId(item.commandId) }));
  const byId = new Map(persisted.map((item) => [item.id, item]));
  const hasCustomOpenFile = persisted.some((item) =>
    item.source === 'user' && item.commandId === APP_COMMAND_IDS.openLocalFile);

  const systemItems = DEFAULT_WORKSPACE_RAIL_ITEMS
    .filter((item) => item.commandId !== APP_COMMAND_IDS.openLocalFile || !hasCustomOpenFile || byId.has(item.id))
    .filter((item) => byId.has(item.id) || isWorkspaceRailItemAvailable(item))
    .map((defaultItem) => {
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

  const customHistory = userItems.some((item) => item.commandId === APP_COMMAND_IDS.openMaterialHistory);
  const railItems = customHistory && !byId.has('system.material-history')
    ? [...systemItems.filter((item) => item.id !== 'system.material-history'), ...userItems]
    : [...systemItems, ...userItems];
  return WORKSPACE_RAIL_SECTIONS.flatMap((section) =>
    normalizeSection(railItems, section, !byId.has('system.material-history'))
  );
}

export function resetWorkspaceRailItems() {
  return normalizeWorkspaceRailItems();
}

export function getWorkspaceRailSectionItems(items: WorkspaceRailItemConfig[], section: WorkspaceRailSection) {
  return normalizeWorkspaceRailItems(items).filter((item) => item.section === section && isWorkspaceRailItemAvailable(item));
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
    return normalizeWorkspaceRailItems(Array.isArray(parsed) ? parsed : undefined);
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
