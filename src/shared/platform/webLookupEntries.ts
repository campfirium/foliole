import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from './storage';

export const WEB_LOOKUP_SELECTION_PLACEHOLDER = '{selection}';
export const WEB_LOOKUP_QUERY_MAX_LENGTH = 4000;

type WebLookupEntryKind = 'prompt' | 'search';

export interface WebLookupEntry {
  builtIn: boolean;
  enabled: boolean;
  id: string;
  kind: WebLookupEntryKind;
  label: string;
  urlTemplate: string;
}

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

const CHATGPT_DEFAULT_LINK = [
  'https://chatgpt.com/?prompt=Please summarize the text inside %3Cselection%3E.',
  '%3Cselection%3E',
  WEB_LOOKUP_SELECTION_PLACEHOLDER,
  '%3C%2Fselection%3E'
].join('%0A');

const BUILT_IN_WEB_LOOKUP_ENTRIES: WebLookupEntry[] = [
  {
    builtIn: true,
    enabled: true,
    id: 'chatgpt',
    kind: 'prompt',
    label: 'ChatGPT',
    urlTemplate: CHATGPT_DEFAULT_LINK
  },
  {
    builtIn: true,
    enabled: true,
    id: 'google',
    kind: 'search',
    label: 'Google',
    urlTemplate: `https://www.google.com/search?q=${WEB_LOOKUP_SELECTION_PLACEHOLDER}`
  },
  {
    builtIn: true,
    enabled: false,
    id: 'duckduckgo',
    kind: 'search',
    label: 'DuckDuckGo',
    urlTemplate: `https://duckduckgo.com/?q=${WEB_LOOKUP_SELECTION_PLACEHOLDER}`
  }
];

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
  return {
    ...defaultEntry,
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : defaultEntry.enabled,
    kind: isValidEntryKind(stored.kind) ? stored.kind : defaultEntry.kind,
    label: typeof stored.label === 'string' && stored.label.trim() ? stored.label.trim() : defaultEntry.label,
    urlTemplate: isValidUrlTemplate(stored.urlTemplate)
      ? normalizeTemplatePlaceholder(stored.urlTemplate)
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
  return [...builtIn, ...custom];
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
  const label = entry.kind === 'prompt'
    ? `Ask ${entry.label} with ${selectionText ? 'selected text' : 'full content'}`
    : `Search with ${entry.label}`;
  return { kind: entry.kind, label, url };
}
