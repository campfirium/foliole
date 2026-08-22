import { randomUUID } from 'node:crypto';

import type { ImportManagerSourceDraft, ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import {
  applyReadwiseSourceTypeSettings,
  readwiseSourceTypeSettings
} from '../../lib/core/import/readwiseSourceSettings.js';

import {
  loadCurrentHostDesktopSources,
  loadDesktopSourceByConfig,
  upsertDesktopSource
} from './desktopSources.js';

function readKind(value: unknown): ReadwiseSourceKind | null {
  return value === 'articles' || value === 'books' || value === 'podcasts' || value === 'tweets'
    ? value
    : null;
}

function parseSettings(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // A malformed Source setting cannot safely select a Readwise config.
  }
  throw new Error('readwise_source_settings_invalid');
}

function currentSourcesByKind() {
  const byKind = new Map<ReadwiseSourceKind, ReturnType<typeof loadCurrentHostDesktopSources>[number]>();
  for (const source of loadCurrentHostDesktopSources('readwise')) {
    const kind = readKind((parseSettings(source.type_settings_json) as Record<string, unknown>).kind);
    if (!kind) throw new Error('readwise_source_kind_missing');
    if (byKind.has(kind)) throw new Error('readwise_source_kind_ambiguous');
    byKind.set(kind, source);
  }
  return byKind;
}

export function hydrateCurrentHostReadwiseSources(sources: ImportManagerSourceDraft[]) {
  const persisted = currentSourcesByKind();
  return sources.map((source) => {
    if (!source.kind) return source;
    const record = persisted.get(source.kind);
    if (!record) return source;
    return {
      ...applyReadwiseSourceTypeSettings(source, parseSettings(record.type_settings_json)),
      id: record.config_ref,
      primaryPath: record.root_path
    };
  });
}

function configRefForSource(source: ImportManagerSourceDraft, existing: ReturnType<typeof currentSourcesByKind>) {
  if (source.kind && existing.has(source.kind)) return existing.get(source.kind)!.config_ref;
  const configured = loadDesktopSourceByConfig('readwise', source.id);
  if (!configured) return source.id;
  if (loadCurrentHostDesktopSources('readwise').some((item) => item.source_ref === configured.source_ref)) {
    return configured.config_ref;
  }
  return `readwise-${randomUUID()}`;
}

export function saveCurrentHostReadwiseSources(sources: ImportManagerSourceDraft[], updatedAt: string) {
  const existing = currentSourcesByKind();
  return sources.map((source) => {
    if (!source.kind || !source.primaryPath.trim()) return source;
    const configRef = configRefForSource(source, existing);
    const persisted = upsertDesktopSource({
      configRef,
      rootPath: source.primaryPath,
      sourceType: 'readwise',
      typeSettings: readwiseSourceTypeSettings(source),
      updatedAt
    });
    return { ...source, id: persisted.config_ref };
  });
}
