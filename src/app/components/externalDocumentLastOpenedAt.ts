import { useEffect, useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';

const EXTERNAL_DOCUMENT_LAST_OPENED_EVENT = 'foliole:external-document-last-opened';

export type ExternalDocumentLastOpenedAtByPath = Record<string, string | undefined>;

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(new Date(value).getTime());
}

function parseExternalDocumentLastOpenedAt(raw: string | null): ExternalDocumentLastOpenedAtByPath {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: ExternalDocumentLastOpenedAtByPath = {};
    for (const [path, value] of Object.entries(parsed)) {
      if (path.trim().length > 0 && isTimestamp(value)) {
        result[path] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function loadExternalDocumentLastOpenedAt() {
  return parseExternalDocumentLastOpenedAt(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.externalDocumentLastOpenedAt)
  );
}

export function markExternalDocumentOpened(absolutePath: string, now = new Date().toISOString()) {
  const next = {
    ...loadExternalDocumentLastOpenedAt(),
    [absolutePath]: now
  };
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.externalDocumentLastOpenedAt, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EXTERNAL_DOCUMENT_LAST_OPENED_EVENT, { detail: next }));
  return next;
}

export function subscribeExternalDocumentLastOpenedAt(listener: (value: ExternalDocumentLastOpenedAtByPath) => void) {
  const handler = (event: Event) => {
    listener(event instanceof CustomEvent ? event.detail as ExternalDocumentLastOpenedAtByPath : loadExternalDocumentLastOpenedAt());
  };
  window.addEventListener(EXTERNAL_DOCUMENT_LAST_OPENED_EVENT, handler);
  return () => window.removeEventListener(EXTERNAL_DOCUMENT_LAST_OPENED_EVENT, handler);
}

export function useExternalDocumentLastOpenedAt() {
  const [lastOpenedAtByPath, setLastOpenedAtByPath] = useState(loadExternalDocumentLastOpenedAt);

  useEffect(() => subscribeExternalDocumentLastOpenedAt(setLastOpenedAtByPath), []);

  return lastOpenedAtByPath;
}
