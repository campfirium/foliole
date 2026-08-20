import type { BrowserWindow } from 'electron';

import { LIBRARY_PATH_LOCATIONS } from '../../lib/platform/libraryPaths.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { loadBackupSettings, saveBackupSettings } from '../database/backupSettings.js';
import { activateReadwiseOnThisHost, loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { restoreSourceDispositions } from '../database/sourceDispositionRestore.js';
import {
  resetSourceDispositions,
  summarizeSourceDispositions
} from '../database/sourceDispositionStates.js';
import { loadSyncPeers, saveSyncPeers } from '../database/syncPeers.js';
import { refreshGlobalClipShortcutFromSettings } from '../globalClipShortcut.js';
import { loadImportManagerSettings, saveImportManagerSettings } from '../import/importManagerSettings.js';
import { refreshKeepImportMonitorFromSettings } from '../import/keepImportMonitor.js';
import { refreshManagedInboxMonitorFromSettings } from '../import/managedInboxMonitor.js';
import { exportCurrentArticleMirror } from '../mirror/exportCurrentArticleMirror.js';
import { rebuildMirrorAttachmentLinks } from '../mirror/rebuildAttachmentLinks.js';
import { rebuildMirrorOutput } from '../mirror/rebuildMirrorOutput.js';
import {
  loadReviewSchedulerSettings,
  saveReviewSchedulerSettings
} from '../reviewSchedulerSettings.js';

import { asBoolean, asLiteralUnion, asNullableString, asString } from './commandParsers.js';
import { handleCompanionPairingCommand } from './companionPairingCommands.js';
import { loadDatabaseMaintenanceStatus } from './databaseMaintenanceStatus.js';
import { loadLibraryPathSettings, openImportRoot, updateLibraryPathSetting } from './libraryPaths.js';
import {
  asFullTextSearchIndexStrategy,
  loadSearchIndexRebuildStatus,
  requestSearchIndexRebuild
} from './searchIndexRebuild.js';
import { exportSourceDispositions, importSourceDispositions } from './sourceDispositionFiles.js';
import { loadAppSettingsState, saveAppSettingsState } from './storage.js';
import { readSettingsObject } from './storageCommandSupport.js';
import { handleExternalSearchStorageCommand } from './storageExternalSearchCommands.js';
import { handlePublishingStorageCommand } from './storagePublishingCommands.js';
import { handleWatchedFolderSettingsCommand } from './storageWatchedFolderCommands.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

function handleSourceDispositionCommand(command: string, window: BrowserWindow | null) {
  if (command === NATIVE_COMMANDS.loadSourceDispositionSummary) return summarizeSourceDispositions();
  if (command === NATIVE_COMMANDS.exportSourceDispositions) return exportSourceDispositions(window);
  if (command === NATIVE_COMMANDS.importSourceDispositions) return importSourceDispositions(window);
  if (command === NATIVE_COMMANDS.restoreSourceDispositions) return restoreSourceDispositions();
  if (command === NATIVE_COMMANDS.resetSourceDispositions) return resetSourceDispositions();
  return undefined;
}

async function refreshAfterLibraryHomeChange() {
  try {
    await rebuildMirrorAttachmentLinks();
    await refreshManagedInboxMonitorFromSettings();
  } catch (error) {
    console.error('[library-paths] post Library Home update refresh failed', error);
  }
}

async function handleLibraryPathUpdateCommand(args: Record<string, unknown>) {
  const location = asLiteralUnion(args.location, LIBRARY_PATH_LOCATIONS, 'location');
  const result = await updateLibraryPathSetting({
    confirm_existing_library_home:
      args.confirm_existing_library_home === undefined
        ? false
        : asBoolean(args.confirm_existing_library_home, 'confirm_existing_library_home'),
    location,
    path: asNullableString(args.path, 'path')
  });
  if (location === 'library_home') {
    void refreshAfterLibraryHomeChange();
    return result;
  }
  if (location === 'assets_dir') {
    await rebuildMirrorAttachmentLinks();
  }
  await refreshManagedInboxMonitorFromSettings();
  return result;
}

export async function handleSettingsStorageCommand(
  command: string,
  args: Record<string, unknown>,
  window: BrowserWindow | null = null
) {
  const externalSearchResult = handleExternalSearchStorageCommand(command, args);
  if (externalSearchResult !== undefined) return externalSearchResult;
  const companionPairingResult = handleCompanionPairingCommand(command, args);
  if (companionPairingResult !== undefined) return companionPairingResult;
  const publishingResult = await handlePublishingStorageCommand(command, args);
  if (publishingResult !== undefined) {
    if (command === NATIVE_COMMANDS.updateFoliolePublishSiteAddress) notifyWorkspaceContentChanged();
    return publishingResult;
  }
  if (command === NATIVE_COMMANDS.loadImportManagerSettings) return loadImportManagerSettings();
  if (command === NATIVE_COMMANDS.loadAppSettingsState) return loadAppSettingsState();
  if (command === NATIVE_COMMANDS.saveAppSettingsState) {
    await saveAppSettingsState(readSettingsObject(args.settings));
    refreshGlobalClipShortcutFromSettings();
    await refreshManagedInboxMonitorFromSettings();
    return null;
  }
  if (command === NATIVE_COMMANDS.loadSearchIndexRebuildStatus) return loadSearchIndexRebuildStatus();
  if (command === NATIVE_COMMANDS.rebuildSearchIndex) {
    return requestSearchIndexRebuild(asFullTextSearchIndexStrategy(args.strategy));
  }
  if (command === NATIVE_COMMANDS.loadSyncPeers) return loadSyncPeers();
  if (command === NATIVE_COMMANDS.saveSyncPeers) {
    return saveSyncPeers(Array.isArray(args.peers) ? (args.peers as Parameters<typeof saveSyncPeers>[0]) : []);
  }
  if (command === NATIVE_COMMANDS.loadLibraryPathSettings) return loadLibraryPathSettings();
  if (command === NATIVE_COMMANDS.loadReadwiseHostAssignment) return loadReadwiseHostAssignment();
  if (command === NATIVE_COMMANDS.activateReadwiseOnThisHost) return activateReadwiseOnThisHost();
  const watchedFolderResult = handleWatchedFolderSettingsCommand(command, args);
  if (watchedFolderResult !== undefined) return watchedFolderResult;
  if (command === NATIVE_COMMANDS.openImportRoot) return openImportRoot();
  if (command === NATIVE_COMMANDS.loadDatabaseMaintenanceStatus) return loadDatabaseMaintenanceStatus();
  if (command === NATIVE_COMMANDS.loadBackupSettings) return loadBackupSettings();
  const sourceDispositionResult = handleSourceDispositionCommand(command, window);
  if (sourceDispositionResult !== undefined) return sourceDispositionResult;
  if (command === NATIVE_COMMANDS.rebuildMirrorOutput) return rebuildMirrorOutput();
  if (command === NATIVE_COMMANDS.rebuildMirrorAttachmentLinks) return rebuildMirrorAttachmentLinks();
  if (command === NATIVE_COMMANDS.exportCurrentArticleMirror) return exportCurrentArticleMirror(asString(args.node_id, 'node_id'), window);
  if (command === NATIVE_COMMANDS.updateLibraryPathSetting) {
    return handleLibraryPathUpdateCommand(args);
  }
  if (command === NATIVE_COMMANDS.saveBackupSettings) return saveBackupSettings(readSettingsObject(args.settings));
  if (command === NATIVE_COMMANDS.saveImportManagerSettings) {
    const result = saveImportManagerSettings(readSettingsObject(args.settings));
    await refreshKeepImportMonitorFromSettings();
    return result;
  }
  if (command === NATIVE_COMMANDS.loadReviewSchedulerSettings) return loadReviewSchedulerSettings();
  if (command === NATIVE_COMMANDS.saveReviewSchedulerSettings) return saveReviewSchedulerSettings(readSettingsObject(args.settings));
  return undefined;
}
