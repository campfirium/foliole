import type { NativeWatchedFolderMatchPreview } from '../../lib/platform/nativeWatchedFolderContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import {
  loadWatchedFolderBindings,
  upsertChangedWatchedFolderSource
} from '../database/watchedFolderBindings.js';
import { discoverDirectoryImportSources } from '../ipc/importSourcePipeline.js';
import { assertNoUnsafePathOverlap } from '../libraryPathSafety.js';
import { loadManagedPathCandidates } from '../managedPathSafety.js';

import { loadImportManagerSettings, saveImportManagerSettings } from './importManagerSettings.js';

function requireBinding(bindingId: string) {
  const binding = loadWatchedFolderBindings().find((item) => item.binding_id === bindingId);
  if (!binding) throw new Error('watched_folder_not_found');
  return binding;
}

export async function previewWatchedFolderReconnect(
  bindingId: string,
  folderPath: string
): Promise<NativeWatchedFolderMatchPreview> {
  const binding = requireBinding(bindingId);
  const normalizedPath = folderPath.trim();
  if (!normalizedPath) throw new Error('watched_folder_path_required');
  assertNoUnsafePathOverlap([
    ...loadManagedPathCandidates(),
    { label: 'Watched folder', path: normalizedPath }
  ]);
  const candidates = await discoverDirectoryImportSources(normalizedPath);
  const candidatePaths = new Set(candidates.map((item) => item.sourceName.replaceAll('\\', '/')));
  const mappedPaths = new Set(openDatabaseConnection().driver.queryAll<{ watched_relative_path: string }>(
    `SELECT watched_relative_path FROM import_sources
     WHERE watched_binding_id = ? AND watched_relative_path IS NOT NULL`, [bindingId]
  ).map((row) => row.watched_relative_path));
  let matchedCount = 0;
  mappedPaths.forEach((relativePath) => {
    if (candidatePaths.has(relativePath)) matchedCount += 1;
  });
  return {
    binding,
    checked_at: new Date().toISOString(),
    folder_path: normalizedPath,
    matched_count: matchedCount,
    missing_count: mappedPaths.size - matchedCount,
    new_count: [...candidatePaths].filter((relativePath) => !mappedPaths.has(relativePath)).length
  };
}

export async function confirmWatchedFolderReconnect(args: {
  bindingId: string;
  folderPath: string;
  highlightPath?: string;
}) {
  const preview = await previewWatchedFolderReconnect(args.bindingId, args.folderPath);
  const binding = preview.binding;
  const settings = loadImportManagerSettings();
  const source = {
    actionMode: binding.action_mode,
    archivePath: binding.archive_path,
    highlightMode: binding.highlight_mode,
    highlightPath: binding.highlight_mode === 'split'
      ? args.highlightPath?.trim() || binding.highlight_path
      : '',
    id: binding.binding_id,
    keepPreview: null,
    keepState: 'enabled' as const,
    primaryPath: preview.folder_path
  };
  const currentIndex = settings.sources.findIndex((item) => item.id === binding.binding_id);
  const sources = currentIndex < 0
    ? [...settings.sources, source]
    : settings.sources.map((item, index) => index === currentIndex ? source : item);
  saveImportManagerSettings({ ...settings, sources });
  const updated = upsertChangedWatchedFolderSource(source, new Date().toISOString());
  return { ...preview, binding: updated ?? binding };
}
