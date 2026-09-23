import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';
import type { WebLookupEntry } from '../../../shared/platform/webLookupEntries';

import type { DocumentHeaderMenuItemConfig } from './documentHeaderMenuSettings';

export const webLookupMenuKey = (id: string) => `lookup:${id}`;
export const commandMenuKey = (id: string) => `command:${id}`;

export function loadEditorContextMenuOrder(links: WebLookupEntry[], commands: DocumentHeaderMenuItemConfig[]) {
  const available = [...links.map((entry) => webLookupMenuKey(entry.id)), ...commands.map((item) => commandMenuKey(item.id))];
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.editorContextMenuOrder);
  let stored: unknown = null;
  try { stored = raw ? JSON.parse(raw) : null; } catch { stored = null; }
  if (!Array.isArray(stored)) return available;
  const seen = new Set<string>();
  const ordered = stored.filter((key): key is string => {
    if (typeof key !== 'string' || !available.includes(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const chatGptKey = webLookupMenuKey('chatgpt');
  return available.includes(chatGptKey) && !seen.has(chatGptKey) ? [chatGptKey, ...ordered] : ordered;
}

export function saveEditorContextMenuOrder(order: string[]) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.editorContextMenuOrder, JSON.stringify(order));
}

export function moveEditorContextMenuKey(order: string[], source: string, target: string) {
  if (!order.includes(source) || !order.includes(target) || source === target) return order;
  const next = order.filter((key) => key !== source);
  next.splice(next.indexOf(target), 0, source);
  return next;
}
