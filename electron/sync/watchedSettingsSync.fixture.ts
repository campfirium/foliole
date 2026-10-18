import { loadWatchedFolderBindingState, upsertChangedWatchedFolderSource } from '../database/watchedFolderBindings.js';
import { saveImportManagerSettingsAndPublish } from '../ipc/storageImportManagerSettingsCommand.js';

import { updateDesktopSyncFreshness } from './desktopMemberSyncCadence.js';
import { saveDesktopSyncGroupRoute, type DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

export async function runWatchedSettingsFixture(action: string, args: Record<string, unknown>) {
  if (action === 'watchedRead') return loadWatchedFolderBindingState();
  if (action === 'watchedRoute') {
    saveDesktopSyncGroupRoute(args as unknown as DesktopSyncGroupPeer);
    updateDesktopSyncFreshness(true, Date.now());
    return null;
  }
  const source = { id: 'watched-rule', primaryPath: String(args.folder), actionMode: 'keep' as const,
    archivePath: '', highlightMode: 'merged' as const, highlightPath: '', keepPreview: null,
    keepState: 'enabled' as const };
  if (action === 'watchedSeed') return upsertChangedWatchedFolderSource(source, new Date().toISOString());
  if (action === 'watchedSave') return saveImportManagerSettingsAndPublish({ sources: [source] });
  throw new Error('unknown watched fixture action');
}
