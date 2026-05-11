import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { rebuildExternalSearchIndexes } from '../database/externalSearchCache.js';
import { pruneExternalSearchCache } from '../database/externalSearchCacheMaintenance.js';
import {
  loadExternalSearchBrowseEntries,
  loadExternalSearchPreview
} from '../database/externalSearchCacheRead.js';
import { loadExternalSearchFolders, saveExternalSearchFolders } from '../database/externalSearchFolders.js';
import { loadReadwiseExternalSearchFolders } from '../database/readwiseManagedExternalDocuments.js';
import { notifyExternalSearchFoldersChanged } from '../externalSearchBackgroundRefreshRuntime.js';

import { asNullableString, asString } from './commandParsers.js';

export function handleExternalSearchStorageCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadExternalSearchFolders) {
    return [...loadExternalSearchFolders(), ...loadReadwiseExternalSearchFolders()];
  }
  if (command === NATIVE_COMMANDS.saveExternalSearchFolders) {
    const folders = Array.isArray(args.folders) ? args.folders : [];
    const savedFolders = saveExternalSearchFolders(folders as Parameters<typeof saveExternalSearchFolders>[0]);
    pruneExternalSearchCache(savedFolders.map((folder) => folder.id));
    notifyExternalSearchFoldersChanged();
    return [...savedFolders, ...loadReadwiseExternalSearchFolders()];
  }
  if (command === NATIVE_COMMANDS.rebuildExternalSearchIndex) {
    return rebuildExternalSearchIndexes(asNullableString(args.folder_id, 'folder_id') ?? undefined);
  }
  if (command === NATIVE_COMMANDS.loadExternalSearchBrowseEntries) {
    return loadExternalSearchBrowseEntries(asString(args.folder_id, 'folder_id'));
  }
  if (command === NATIVE_COMMANDS.loadExternalSearchPreview) {
    return loadExternalSearchPreview(asString(args.absolute_path, 'absolute_path'));
  }
  return undefined;
}
