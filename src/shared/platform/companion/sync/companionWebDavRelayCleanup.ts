import type { RequestSyncDatabaseHost } from '../../../../../lib/core/sync/requestSyncObjectEndpoint.js';
import type { RequestSyncAuthenticatedContext } from '../../../../../lib/core/sync/requestSyncWire.js';
import { readWebDavRelayBodyScope } from '../../../../../lib/core/sync/webDavRelayBodyScope.js';
import { captureWebDavRelayCleanup } from '../../../../../lib/core/sync/webDavRelayCollectionCleanup.js';
import { companionFramedFileOwner } from '../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap.js';

import { createCompanionWebDavRelayHttp, type CompanionWebDavHttpStats } from './companionWebDavRelayHttp.js';
import { loadCompanionWebDavRelay } from './companionWebDavRelayStore.js';
import { currentCompanionAttachmentHost } from './framed/companionAttachmentBlockFiles.js';
import { currentCompanionFramedSyncFiles } from './framed/companionFramedSyncFiles.js';

export async function captureCompanionWebDavRelayCleanup(host: RequestSyncDatabaseHost,
  context: RequestSyncAuthenticatedContext, role: 'initiator' | 'responder', signal: AbortSignal) {
  const binding = await loadCompanionWebDavRelay();
  const peer = role === 'initiator' ? context.responderDeviceId : context.initiatorDeviceId;
  if (!binding || binding.desktop_device_id !== peer || binding.group_id !== context.groupId) return;
  const database = getIosCompanionDatabaseOwner();
  const files = currentCompanionFramedSyncFiles();
  const stats: CompanionWebDavHttpStats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
  const http = createCompanionWebDavRelayHttp(binding.directory_url, files, companionFramedFileOwner(database), stats, signal);
  return captureWebDavRelayCleanup({
    host, files, signal, attachments: await currentCompanionAttachmentHost(host),
    loadScope: db => readWebDavRelayBodyScope(db, binding, binding.phone_device_id),
    request: async (url, input, receive) => {
      if (getIosCompanionDatabaseOwner() !== database || (await loadCompanionWebDavRelay())?.id !== binding.id) {
        throw new Error('webdav_relay_scope_changed');
      }
      try { return await http(url, input, receive); }
      finally {
        if (input.method === 'DELETE') console.info('[sync] WebDAV collection cleanup', stats);
      }
    }
  }, context, role);
}
