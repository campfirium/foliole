import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export interface DocumentHeaderMenuItemConfig {
  id: string;
  commandId: string;
  order: number;
  source: 'system' | 'user';
  visible: boolean;
  labelOverride?: string;
}

export const DEFAULT_DOCUMENT_HEADER_MENU_ITEMS: DocumentHeaderMenuItemConfig[] = [
  { id: 'system.publish-site', commandId: APP_COMMAND_IDS.publishToFoliole, order: 0, source: 'system', visible: true },
  { id: 'system.publish-wordpress', commandId: APP_COMMAND_IDS.publishToWordPress, order: 1, source: 'system', visible: true },
  { id: 'system.publish-discourse', commandId: APP_COMMAND_IDS.publishToDiscourse, order: 2, source: 'system', visible: true },
  { id: 'system.compare-draft', commandId: APP_COMMAND_IDS.toggleComparisonView, order: 3, source: 'system', visible: true },
  { id: 'system.toggle-source', commandId: APP_COMMAND_IDS.toggleEditorDisplayMode, order: 4, source: 'system', visible: true },
  { id: 'system.customize-menu', commandId: APP_COMMAND_IDS.customizeDocumentMenu, order: 5, source: 'system', visible: true }
];

const SYSTEM_ITEM_IDS = new Set(DEFAULT_DOCUMENT_HEADER_MENU_ITEMS.map((item) => item.id));

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeStoredItem(value: unknown): DocumentHeaderMenuItemConfig | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.commandId !== 'string') {
    return null;
  }
  return {
    id: value.id,
    commandId: value.commandId,
    order: typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : 0,
    source: value.source === 'user' ? 'user' : 'system',
    visible: typeof value.visible === 'boolean' ? value.visible : true,
    ...(typeof value.labelOverride === 'string' && value.labelOverride.trim() ? { labelOverride: value.labelOverride.trim() } : {})
  };
}

function normalizeOrder(items: DocumentHeaderMenuItemConfig[]) {
  return [...items]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((item, order) => ({ ...item, order }));
}

export function normalizeDocumentHeaderMenuItems(items: DocumentHeaderMenuItemConfig[] = DEFAULT_DOCUMENT_HEADER_MENU_ITEMS) {
  const storedById = new Map(items.map((item) => [item.id, item]));
  const defaults = DEFAULT_DOCUMENT_HEADER_MENU_ITEMS.map((defaultItem) => ({
    ...defaultItem,
    ...(storedById.get(defaultItem.id) ?? {}),
    commandId: defaultItem.commandId,
    source: 'system' as const
  }));
  const custom = items.filter((item) => item.source === 'user' && !SYSTEM_ITEM_IDS.has(item.id));
  const seen = new Set<string>();
  return normalizeOrder([...defaults, ...custom].filter((item) => {
    if (!item.id || !item.commandId || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }));
}

export function resetDocumentHeaderMenuItems() {
  return normalizeDocumentHeaderMenuItems(DEFAULT_DOCUMENT_HEADER_MENU_ITEMS);
}

export function toggleDocumentHeaderMenuItemVisibility(items: DocumentHeaderMenuItemConfig[], itemId: string, visible: boolean) {
  return normalizeDocumentHeaderMenuItems(items.map((item) => (item.id === itemId ? { ...item, visible } : item)));
}

export function moveDocumentHeaderMenuItem(items: DocumentHeaderMenuItemConfig[], itemId: string, order: number) {
  const normalized = normalizeDocumentHeaderMenuItems(items);
  const target = normalized.find((item) => item.id === itemId);
  if (!target) return normalized;
  const nextOrder = Number.isFinite(order) ? Math.max(0, Math.floor(order)) : 0;
  const otherItems = normalized.filter((item) => item.id !== itemId);
  const insertAt = Math.min(nextOrder, otherItems.length);
  return normalizeDocumentHeaderMenuItems([
    ...otherItems.slice(0, insertAt),
    target,
    ...otherItems.slice(insertAt)
  ].map((item, nextItemOrder) => ({ ...item, order: nextItemOrder })));
}

function createUserMenuItemId(commandId: string) {
  return `user.${commandId.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

export function addDocumentHeaderMenuItem(items: DocumentHeaderMenuItemConfig[], command: { commandId: string; label: string }) {
  const normalized = normalizeDocumentHeaderMenuItems(items);
  const existing = normalized.find((item) => item.commandId === command.commandId);
  if (existing) {
    return normalizeDocumentHeaderMenuItems(
      normalized.map((item) => item.id === existing.id ? { ...item, labelOverride: command.label, visible: true } : item)
    );
  }
  return normalizeDocumentHeaderMenuItems([
    ...normalized,
    {
      id: createUserMenuItemId(command.commandId),
      commandId: command.commandId,
      labelOverride: command.label,
      order: normalized.length,
      source: 'user',
      visible: true
    }
  ]);
}

export function removeDocumentHeaderMenuItem(items: DocumentHeaderMenuItemConfig[], itemId: string) {
  const target = normalizeDocumentHeaderMenuItems(items).find((item) => item.id === itemId);
  if (!target) return normalizeDocumentHeaderMenuItems(items);
  if (target.source === 'system') return toggleDocumentHeaderMenuItemVisibility(items, itemId, false);
  return normalizeDocumentHeaderMenuItems(items.filter((item) => item.id !== itemId));
}

export function loadDocumentHeaderMenuItems() {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.documentHeaderMenuItems);
  if (!raw) return resetDocumentHeaderMenuItems();
  try {
    const parsed = JSON.parse(raw);
    return normalizeDocumentHeaderMenuItems(Array.isArray(parsed) ? parsed.map(sanitizeStoredItem).filter(Boolean) as DocumentHeaderMenuItemConfig[] : []);
  } catch {
    return resetDocumentHeaderMenuItems();
  }
}

export function saveDocumentHeaderMenuItems(items: DocumentHeaderMenuItemConfig[]) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.documentHeaderMenuItems,
    JSON.stringify(normalizeDocumentHeaderMenuItems(items))
  );
}
