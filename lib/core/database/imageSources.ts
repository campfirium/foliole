import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';

export type ImageSources = Record<string, string>;

export function parseImageSources(value: unknown): ImageSources {
  if (typeof value === 'string') {
    try { return parseImageSources(JSON.parse(value)); } catch { return {}; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value).filter(([key, url]) => {
    if (!parseCanonicalAttachmentStorageKey(key) || typeof url !== 'string') return false;
    try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
  });
  return Object.fromEntries(entries) as ImageSources;
}

export function serializeImageSources(sources: ImageSources) {
  const entries = Object.entries(parseImageSources(sources)).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : null;
}
