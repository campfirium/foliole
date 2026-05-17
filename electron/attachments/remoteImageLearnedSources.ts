import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import { resolveImageHost } from './remoteImageDownload.js';

export const REMOTE_IMAGE_LEARNED_SOURCES_KEY = 'remote-image-learned-sources-v1';

interface LearnedSourceEntry {
  sourceOrigin: string;
  updatedAt: string;
}

interface LearnedSourcesPayload {
  entries?: Record<string, LearnedSourceEntry>;
  version?: number;
}

export interface RemoteImageLearnedSourceState {
  imageHost: string | null;
  sourceOrigin: string | null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function normalizeRemoteImageSourceOrigin(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? `${parsed.origin}/` : null;
  } catch {
    return null;
  }
}

function readLearnedSources(): Record<string, LearnedSourceEntry> {
  const payload = toRecord(loadJsonSetting(REMOTE_IMAGE_LEARNED_SOURCES_KEY) as LearnedSourcesPayload | null);
  const entries = toRecord(payload.entries);
  return Object.fromEntries(
    Object.entries(entries).flatMap(([host, entry]) => {
      const normalizedHost = host.trim().toLowerCase();
      const value = toRecord(entry);
      const sourceOrigin = normalizeRemoteImageSourceOrigin(typeof value.sourceOrigin === 'string' ? value.sourceOrigin : null);
      const updatedAt = typeof value.updatedAt === 'string' && value.updatedAt.trim() ? value.updatedAt : null;
      return normalizedHost && sourceOrigin && updatedAt ? [[normalizedHost, { sourceOrigin, updatedAt }]] : [];
    })
  );
}

function writeLearnedSources(entries: Record<string, LearnedSourceEntry>) {
  saveJsonSetting(REMOTE_IMAGE_LEARNED_SOURCES_KEY, { entries, version: 1 });
}

export function loadRemoteImageLearnedSource(sourceUrl: string): RemoteImageLearnedSourceState {
  const imageHost = resolveImageHost(sourceUrl);
  if (!imageHost) {
    return { imageHost: null, sourceOrigin: null };
  }
  return {
    imageHost,
    sourceOrigin: readLearnedSources()[imageHost]?.sourceOrigin ?? null
  };
}

export function learnRemoteImageSourceOrigin(sourceUrl: string, sourceOrigin: string | null | undefined) {
  const imageHost = resolveImageHost(sourceUrl);
  const normalizedSourceOrigin = normalizeRemoteImageSourceOrigin(sourceOrigin);
  if (!imageHost || !normalizedSourceOrigin) {
    return { imageHost: imageHost || null, sourceOrigin: null, status: 'invalid' as const };
  }
  writeLearnedSources({
    ...readLearnedSources(),
    [imageHost]: { sourceOrigin: normalizedSourceOrigin, updatedAt: new Date().toISOString() }
  });
  return { imageHost, sourceOrigin: normalizedSourceOrigin, status: 'saved' as const };
}

export function forgetRemoteImageLearnedSource(sourceUrl: string) {
  const imageHost = resolveImageHost(sourceUrl);
  if (!imageHost) {
    return { imageHost: null, status: 'invalid' as const };
  }
  const entries = readLearnedSources();
  if (!entries[imageHost]) {
    return { imageHost, status: 'missing' as const };
  }
  delete entries[imageHost];
  writeLearnedSources(entries);
  return { imageHost, status: 'forgotten' as const };
}
