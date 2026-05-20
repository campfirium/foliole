import {
  WEB_LOOKUP_QUERY_MAX_LENGTH,
  WEB_LOOKUP_PROMPT_MAX_ENCODED_LENGTH,
  WEB_LOOKUP_SELECTION_PLACEHOLDER,
  WEB_LOOKUP_TITLE_PLACEHOLDER,
  type WebLookupEntry
} from './webLookupEntryDefaults';

const SELECTION_SENTINEL = '__FOLIOLE_SELECTION__';
const TITLE_SENTINEL = '__FOLIOLE_TITLE__';

export function normalizeTemplatePlaceholder(value: string) {
  return value
    .replaceAll('{query}', WEB_LOOKUP_SELECTION_PLACEHOLDER)
    .replaceAll('{text}', WEB_LOOKUP_SELECTION_PLACEHOLDER);
}

export function isValidUrlTemplate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const template = normalizeTemplatePlaceholder(value);
  if (!template.includes(WEB_LOOKUP_SELECTION_PLACEHOLDER)) {
    return false;
  }
  try {
    const url = new URL(
      template
        .replace(WEB_LOOKUP_SELECTION_PLACEHOLDER, 'test')
        .replace(WEB_LOOKUP_TITLE_PLACEHOLDER, 'title')
    );
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveTemplateUrl(entry: WebLookupEntry, selectionText: string, titleText: string) {
  const resolved = normalizeTemplatePlaceholder(entry.urlTemplate)
    .replaceAll(WEB_LOOKUP_SELECTION_PLACEHOLDER, encodeURIComponent(selectionText))
    .replaceAll(WEB_LOOKUP_TITLE_PLACEHOLDER, encodeURIComponent(titleText));
  try {
    const url = new URL(resolved);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolveWebLookupUrl(entry: WebLookupEntry, sourceText: string, titleText?: string | null) {
  if (!isValidUrlTemplate(entry.urlTemplate)) {
    return null;
  }
  const query = sourceText.trim().slice(0, WEB_LOOKUP_QUERY_MAX_LENGTH);
  if (!query) {
    return null;
  }
  const title = titleText?.trim().slice(0, WEB_LOOKUP_QUERY_MAX_LENGTH) ?? '';
  return resolveTemplateUrl(entry, query, title);
}

export function resolveWebLookupPromptText(entry: WebLookupEntry, sourceText: string, titleText?: string | null) {
  if (!isValidUrlTemplate(entry.urlTemplate)) {
    return null;
  }
  const query = sourceText.trim();
  if (!query) {
    return null;
  }
  const title = titleText?.trim() ?? '';
  const sentinelTemplate = normalizeTemplatePlaceholder(entry.urlTemplate)
    .replaceAll(WEB_LOOKUP_SELECTION_PLACEHOLDER, SELECTION_SENTINEL)
    .replaceAll(WEB_LOOKUP_TITLE_PLACEHOLDER, TITLE_SENTINEL);
  try {
    const url = new URL(sentinelTemplate);
    for (const value of url.searchParams.values()) {
      if (value.includes(SELECTION_SENTINEL)) {
        return value
          .replaceAll(SELECTION_SENTINEL, query)
          .replaceAll(TITLE_SENTINEL, title);
      }
    }
  } catch {
    return null;
  }
  return query;
}

export function resolveWebLookupPromptActionUrl(entry: WebLookupEntry, promptText: string, titleText?: string | null) {
  return resolveTemplateUrl(entry, promptText, titleText?.trim() ?? '');
}

export function isWebLookupPromptTooLong(promptText: string) {
  return encodeURIComponent(promptText).length > WEB_LOOKUP_PROMPT_MAX_ENCODED_LENGTH;
}

export function resolveWebLookupOverflowTargetUrl(entry: WebLookupEntry) {
  if (!isValidUrlTemplate(entry.urlTemplate)) {
    return null;
  }
  const sentinelTemplate = normalizeTemplatePlaceholder(entry.urlTemplate)
    .replaceAll(WEB_LOOKUP_SELECTION_PLACEHOLDER, SELECTION_SENTINEL)
    .replaceAll(WEB_LOOKUP_TITLE_PLACEHOLDER, TITLE_SENTINEL);
  try {
    const url = new URL(sentinelTemplate);
    const placeholderKeys = [...url.searchParams.entries()]
      .filter(([, value]) => value.includes(SELECTION_SENTINEL) || value.includes(TITLE_SENTINEL))
      .map(([key]) => key);
    for (const key of placeholderKeys) {
      url.searchParams.delete(key);
    }
    const resolved = url.toString()
      .replaceAll(SELECTION_SENTINEL, '')
      .replaceAll(TITLE_SENTINEL, '');
    const safeUrl = new URL(resolved);
    return safeUrl.protocol === 'http:' || safeUrl.protocol === 'https:' ? safeUrl.toString() : null;
  } catch {
    return null;
  }
}
