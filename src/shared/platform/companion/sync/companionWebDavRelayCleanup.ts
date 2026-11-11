import type { RequestSyncDatabaseHost } from '../../../../../lib/core/sync/requestSyncObjectEndpoint.js';
import type { RequestSyncAuthenticatedContext } from '../../../../../lib/core/sync/requestSyncWire.js';
import { readWebDavAuthenticationPause, webDavAuthenticationKey, withWebDavAuthenticationPause }
  from '../../../../../lib/core/sync/webDavAuthenticationPause.js';
import { readWebDavRelayBodyScope } from '../../../../../lib/core/sync/webDavRelayBodyScope.js';
import { captureWebDavRelayCleanup } from '../../../../../lib/core/sync/webDavRelayCollectionCleanup.js';
import { webDavRelayCredentialReference } from '../../../../../lib/platform/nativeWebDavRelayHttpContract.js';
import { companionFramedFileOwner } from '../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap.js';

import { createCompanionWebDavRelayHttp, type CompanionWebDavHttpStats } from './companionWebDavRelayHttp.js';
import { loadCompanionWebDavRelay, notifyCompanionWebDavWork } from './companionWebDavRelayStore.js';
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
  const localEpoch = role === 'initiator' ? context.initiatorLibraryEpoch : context.responderLibraryEpoch;
  const authKey = webDavAuthenticationKey(binding, binding.phone_device_id, localEpoch);
  if (authKey && await host.readSnapshot(db => readWebDavAuthenticationPause(db, authKey), signal)) return;
  const pause = authKey ? { key: authKey, changed: notifyCompanionWebDavWork } : undefined;
  const http = createCompanionWebDavRelayHttp(binding.directory_url, files, companionFramedFileOwner(database), stats, signal,
    webDavRelayCredentialReference(binding, localEpoch));
  return captureWebDavRelayCleanup({
    host, files, signal, attachments: await currentCompanionAttachmentHost(host),
    loadScope: db => readWebDavRelayBodyScope(db, binding, binding.phone_device_id),
    request: async (url, input, receive) => {
      const active = await loadCompanionWebDavRelay();
      if (getIosCompanionDatabaseOwner() !== database || active?.id !== binding.id ||
        active.credential_version !== binding.credential_version) {
        throw new Error('webdav_relay_scope_changed');
      }
      try { return await withWebDavAuthenticationPause(host, pause, http, signal, request => request(url, input, receive)); }
      finally {
        if (input.method === 'DELETE') console.info('[sync] WebDAV collection cleanup', stats);
      }
    }
  }, context, role);
}
