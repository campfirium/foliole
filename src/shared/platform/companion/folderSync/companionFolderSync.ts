import { Capacitor, registerPlugin } from '@capacitor/core';
import { z } from 'zod';

import type { FolderSyncNativePlugin } from '../../../../../lib/platform/nativeFolderSyncContract.js';
import { companionFramedFileOwner } from '../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap.js';
import { currentCompanionAttachmentHost } from '../sync/framed/companionAttachmentBlockFiles.js';
import { currentCompanionRequestSyncDatabaseHost } from '../sync/framed/companionRequestSyncDatabaseHost.js';
import { loadCompanionSyncGroup } from '../sync/syncGroupStore.js';

import { createFolderSyncService } from './folderSyncService.js';

const plugin = registerPlugin<FolderSyncNativePlugin>('FolioleFolderSync');
export function supportsCompanionFolderSync() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('FolioleFolderSync');
}

async function sourceIdentity() {
  return getIosCompanionDatabaseOwner().read(async db => {
    const [row] = await db.query('SELECT library_epoch FROM node_version_local_proof_state WHERE singleton_id = 1');
    return z.string().min(1).parse(row?.library_epoch);
  });
}

export const companionFolderSync = createFolderSyncService(plugin, async () => {
  if (await loadCompanionSyncGroup()) throw new Error('folder_sync_device_sync_configured');
  const owner = getIosCompanionDatabaseOwner();
  const identity = companionFramedFileOwner(owner);
  const sourceId = await sourceIdentity();
  const source = await currentCompanionRequestSyncDatabaseHost();
  const attachments = await currentCompanionAttachmentHost(source);
  return { sourceId, source, attachments, assertCurrent() {
    if (owner !== getIosCompanionDatabaseOwner() || companionFramedFileOwner(owner).generation_id !== identity.generation_id) {
      throw new Error('folder_sync_library_changed');
    }
  } };
});

export async function readCompanionFolderSyncState() {
  const [{ location }, group, sourceId] = await Promise.all([
    companionFolderSync.read(), loadCompanionSyncGroup(), sourceIdentity()
  ]);
  return { deviceSyncConfigured: Boolean(group), location: location ? { ...location,
    completion: location.completion?.sourceId === sourceId ? location.completion : null } : null };
}
