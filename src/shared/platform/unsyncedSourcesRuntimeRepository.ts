import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeRestoreUnsyncedSourceResult,
  NativeUnsyncedSourceEntry,
  NativeUnsyncedSourcesResult
} from '../../../lib/platform/nativeUnsyncedSourcesContract';

import { getRuntimeInvoke } from './runtimeInvoke';

export interface RuntimeUnsyncedSourceEntry {
  contentPreview: string | null;
  firstSeenAt: string;
  hasSourceUpdate: boolean;
  id: string;
  lastImportedAt: string | null;
  lastNodeId: string | null;
  lastSeenAt: string;
  ruleId: string;
  sourcePath: string;
  title: string;
}

export interface RuntimeUnsyncedSourcesResult {
  entries: RuntimeUnsyncedSourceEntry[];
  loadedAt: string;
}

function titleFromSourcePath(sourcePath: string) {
  const fileName = sourcePath.split(/[\\/]/).pop()?.trim() || sourcePath;
  return fileName.replace(/\.(md|markdown|html|txt)$/i, '').trim() || fileName;
}

function toRuntimeEntry(entry: NativeUnsyncedSourceEntry): RuntimeUnsyncedSourceEntry {
  return {
    contentPreview: entry.content_preview,
    firstSeenAt: entry.first_seen_at,
    hasSourceUpdate: entry.has_source_update,
    id: `${entry.rule_id}:${entry.source_path}`,
    lastImportedAt: entry.last_imported_at,
    lastNodeId: entry.last_node_id,
    lastSeenAt: entry.last_seen_at,
    ruleId: entry.rule_id,
    sourcePath: entry.source_path,
    title: entry.title.trim() || titleFromSourcePath(entry.source_path)
  };
}

export async function loadRuntimeUnsyncedSources(): Promise<RuntimeUnsyncedSourcesResult> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return { entries: [], loadedAt: new Date().toISOString() };
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.loadUnsyncedSources) as NativeUnsyncedSourcesResult | null;
  return {
    entries: Array.isArray(result?.entries) ? result.entries.map(toRuntimeEntry) : [],
    loadedAt: result?.loaded_at ?? new Date().toISOString()
  };
}

export async function restoreRuntimeUnsyncedSource(entry: Pick<RuntimeUnsyncedSourceEntry, 'ruleId' | 'sourcePath'>) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.restoreUnsyncedSource, {
    rule_id: entry.ruleId,
    source_path: entry.sourcePath
  }) as Promise<NativeRestoreUnsyncedSourceResult | null>;
}
