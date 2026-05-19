import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from './storage';
import {
  BUILT_IN_WEB_LOOKUP_ENTRIES,
  CHATGPT_CONTENT_DEFAULT_LINK,
  CHATGPT_OLD_DEFAULT_LINK,
  CHATGPT_SOURCE_TEXT_DEFAULT_LINK,
  CHATGPT_TEXT_LABEL_DEFAULT_LINK,
  CHATGPT_TEXT_DEFAULT_LINK,
  WEB_LOOKUP_QUERY_MAX_LENGTH,
  WEB_LOOKUP_SELECTION_PLACEHOLDER,
  type WebLookupEntry,
  type WebLookupEntryKind
} from './webLookupEntryDefaults';

export { WEB_LOOKUP_QUERY_MAX_LENGTH, WEB_LOOKUP_SELECTION_PLACEHOLDER, type WebLookupEntry } from './webLookupEntryDefaults';

interface WebLookupContext {
  documentText?: string | null | undefined;
  selectionText?: string | null | undefined;
}

interface ResolvedWebLookupAction {
  kind: WebLookupEntryKind;
  label: string;
  url: string;
}

type StoredWebLookupEntry = Partial<WebLookupEntry> & { id?: unknown };
type WebLookupEntryPatch = Partial<Pick<WebLookupEntry, 'enabled' | 'label' | 'urlTemplate'>>;

const LEGACY_BUILT_IN_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  duckduckgo: 'DuckDuckGo',
  google: 'Google'
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidEntryKind(value: unknown): value is WebLookupEntryKind {
  return value === 'prompt' || value === 'search';
}

function normalizeTemplatePlaceholder(value: string) {
  return value
    .replaceAll('{query}', WEB_LOOKUP_SELECTION_PLACEHOLDER)
    .replaceAll('{text}', WEB_LOOKUP_SELECTION_PLACEHOLDER);
}

function isValidUrlTemplate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const template = normalizeTemplatePlaceholder(value);
  if (!template.includes(WEB_LOOKUP_SELECTION_PLACEHOLDER)) {
    return false;
  }
  try {
    const url = new URL(template.replace(WEB_LOOKUP_SELECTION_PLACEHOLDER, 'test'));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeStoredEntry(value: unknown): StoredWebLookupEntry | null {
  if (!isObject(value) || typeof value.id !== 'string') {
    return null;
  }
  return value as StoredWebLookupEntry;
}

function applyStoredEntry(defaultEntry: WebLookupEntry, stored: StoredWebLookupEntry | undefined): WebLookupEntry {
  if (!stored) {
    return defaultEntry;
  }
  const storedTemplate = typeof stored.urlTemplate === 'string' ? normalizeTemplatePlaceholder(stored.urlTemplate) : '';
  const storedLabel = typeof stored.label === 'string' && stored.label.trim() ? stored.label.trim() : '';
  const label = storedLabel && storedLabel !== LEGACY_BUILT_IN_LABELS[defaultEntry.id] ? storedLabel : defaultEntry.label;
  return {
    ...defaultEntry,
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : defaultEntry.enabled,
    kind: isValidEntryKind(stored.kind) ? stored.kind : defaultEntry.kind,
    label,
    urlTemplate: isValidUrlTemplate(storedTemplate) &&
      storedTemplate !== CHATGPT_CONTENT_DEFAULT_LINK &&
      storedTemplate !== CHATGPT_OLD_DEFAULT_LINK &&
      storedTemplate !== CHATGPT_TEXT_DEFAULT_LINK &&
      storedTemplate !== CHATGPT_SOURCE_TEXT_DEFAULT_LINK &&
      storedTemplate !== CHATGPT_TEXT_LABEL_DEFAULT_LINK
      ? storedTemplate
      : defaultEntry.urlTemplate
  };
}

function readStoredEntries() {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(sanitizeStoredEntry).filter((entry): entry is StoredWebLookupEntry => entry !== null) : [];
  } catch {
    return [];
  }
}

function serializeEntries(entries: WebLookupEntry[]) {
  return JSON.stringify(entries);
}

function toCustomEntry(entry: StoredWebLookupEntry): WebLookupEntry | null {
  if (
    typeof entry.id !== 'string' ||
    !isValidEntryKind(entry.kind) ||
    typeof entry.label !== 'string' ||
    typeof entry.enabled !== 'boolean' ||
    !entry.label.trim() ||
    !isValidUrlTemplate(entry.urlTemplate)
  ) {
    return null;
  }
  return {
    builtIn: false,
    enabled: entry.enabled,
    id: entry.id,
    kind: entry.kind,
    label: entry.label.trim(),
    urlTemplate: normalizeTemplatePlaceholder(entry.urlTemplate)
  };
}

export function getWebLookupEntries(): WebLookupEntry[] {
  const storedEntries = readStoredEntries();
  const storedById = new Map(storedEntries.map((entry) => [entry.id, entry]));
  const builtIn = BUILT_IN_WEB_LOOKUP_ENTRIES.map((entry) => applyStoredEntry(entry, storedById.get(entry.id)));
  const custom = storedEntries
    .filter((entry) => typeof entry.id === 'string' && !BUILT_IN_WEB_LOOKUP_ENTRIES.some((builtInEntry) => builtInEntry.id === entry.id))
    .map(toCustomEntry)
    .filter((entry): entry is WebLookupEntry => entry !== null);
  const entries = [...builtIn, ...custom];
  const defaultOrder = new Map(entries.map((entry, index) => [entry.id, index]));
  const storedOrder = new Map(storedEntries.map((entry, index) => [entry.id, index]));
  return entries.sort((left, right) => (
    (storedOrder.get(left.id) ?? storedEntries.length + (defaultOrder.get(left.id) ?? 0)) -
    (storedOrder.get(right.id) ?? storedEntries.length + (defaultOrder.get(right.id) ?? 0))
  ));
}

export function getEnabledWebLookupEntries() {
  return getWebLookupEntries().filter((entry) => entry.enabled);
}

export function updateWebLookupEntry(entryId: string, patch: WebLookupEntryPatch) {
  const entries = getWebLookupEntries().map((entry) => {
    if (entry.id !== entryId) {
      return entry;
    }
    return {
      ...entry,
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : entry.enabled,
      label: typeof patch.label === 'string' && patch.label.trim() ? patch.label : entry.label,
      urlTemplate: isValidUrlTemplate(patch.urlTemplate)
        ? normalizeTemplatePlaceholder(patch.urlTemplate)
        : entry.urlTemplate
    };
  });
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries, serializeEntries(entries));
  return entries;
}

export function addWebLookupEntry() {
  const entries = getWebLookupEntries();
  const nextEntry: WebLookupEntry = {
    builtIn: false,
    enabled: true,
    id: `custom-${crypto.randomUUID()}`,
    kind: 'search',
    label: 'New menu item',
    urlTemplate: `https://example.com/?q=${WEB_LOOKUP_SELECTION_PLACEHOLDER}`
  };
  const nextEntries = [...entries, nextEntry];
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries, serializeEntries(nextEntries));
  return nextEntries;
}

export function removeWebLookupEntry(entryId: string) {
  const entries = getWebLookupEntries().filter((entry) => entry.builtIn || entry.id !== entryId);
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries, serializeEntries(entries));
  return entries;
}

export function moveWebLookupEntry(entryId: string, targetId: string) {
  const entries = getWebLookupEntries();
  const from = entries.findIndex((entry) => entry.id === entryId);
  const to = entries.findIndex((entry) => entry.id === targetId);
  if (from < 0 || to < 0 || from === to) return entries;
  const nextEntries = [...entries];
  const [entry] = nextEntries.splice(from, 1);
  nextEntries.splice(to, 0, entry);
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries, serializeEntries(nextEntries));
  return nextEntries;
}

export function resolveWebLookupUrl(entry: WebLookupEntry, sourceText: string) {
  if (!isValidUrlTemplate(entry.urlTemplate)) {
    return null;
  }
  const query = sourceText.trim().slice(0, WEB_LOOKUP_QUERY_MAX_LENGTH);
  if (!query) {
    return null;
  }
  const resolved = normalizeTemplatePlaceholder(entry.urlTemplate)
    .replaceAll(WEB_LOOKUP_SELECTION_PLACEHOLDER, encodeURIComponent(query));
  try {
    const url = new URL(resolved);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolveWebLookupAction(
  entry: WebLookupEntry,
  context: WebLookupContext
): ResolvedWebLookupAction | null {
  const selectionText = context.selectionText?.trim() ?? '';
  const documentText = context.documentText?.trim() ?? '';
  const sourceText = selectionText || (entry.kind === 'prompt' ? documentText : '');
  const url = sourceText ? resolveWebLookupUrl(entry, sourceText) : null;
  if (!url) {
    return null;
  }
  return { kind: entry.kind, label: entry.label, url };
}
