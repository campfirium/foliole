import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeRestoreRemovedSourceResult,
  NativeRemovedSourceEntry,
  NativeRemovedSourcesResult
} from '../../../lib/platform/nativeRemovedSourcesContract';

import { getRuntimeInvoke } from './runtimeInvoke';

export interface RuntimeRemovedSourceEntry {
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

export interface RuntimeRemovedSourcesResult {
  entries: RuntimeRemovedSourceEntry[];
  loadedAt: string;
}

function titleFromSourcePath(sourcePath: string) {
  const fileName = sourcePath.split(/[\\/]/).pop()?.trim() || sourcePath;
  return fileName.replace(/\.(md|markdown|html|txt)$/i, '').trim() || fileName;
}

function toRuntimeEntry(entry: NativeRemovedSourceEntry): RuntimeRemovedSourceEntry {
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

export async function loadRuntimeRemovedSources(): Promise<RuntimeRemovedSourcesResult> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return { entries: [], loadedAt: new Date().toISOString() };
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.loadRemovedSources) as NativeRemovedSourcesResult | null;
  return {
    entries: Array.isArray(result?.entries) ? result.entries.map(toRuntimeEntry) : [],
    loadedAt: result?.loaded_at ?? new Date().toISOString()
  };
}

export async function restoreRuntimeRemovedSource(entry: Pick<RuntimeRemovedSourceEntry, 'ruleId' | 'sourcePath'>) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.restoreRemovedSource, {
    rule_id: entry.ruleId,
    source_path: entry.sourcePath
  }) as Promise<NativeRestoreRemovedSourceResult | null>;
}
