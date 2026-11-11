import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import type { RequestSyncAuthenticatedContext } from '../../lib/core/sync/requestSyncWire.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { captureWebDavRelayCleanup } from '../../lib/core/sync/webDavRelayCollectionCleanup.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import { createDesktopLibrarySyncFiles } from './desktopFramedSyncFiles.js';
import { createDesktopRequestSyncAttachmentHost } from './desktopRequestSyncAttachmentHost.js';
import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';
import { authorizeDesktopWebDavRelay } from './desktopWebDavRelayAuthorization.js';
import { createDesktopWebDavRelayHttp, type DesktopWebDavRelayHttpStats } from './desktopWebDavRelayHttp.js';
import { loadDesktopBoundWebDavRelay } from './desktopWebDavRelaySettings.js';
import { recordDesktopWebDavUsage } from './desktopWebDavUsage.js';

export async function captureDesktopWebDavRelayCleanup(host: RequestSyncDatabaseHost,
  context: RequestSyncAuthenticatedContext, role: 'initiator' | 'responder', signal: AbortSignal) {
  const current = () => runWithDatabaseConnectionOwner(() => {
    const binding = isDesktopCompanionSyncParticipating() && loadDesktopBoundWebDavRelay();
    return binding ? { binding, owner: openDatabaseConnection() } : undefined;
  });
  const runtime = await current();
  const peer = role === 'initiator' ? context.responderDeviceId : context.initiatorDeviceId;
  if (!runtime || runtime.binding.phone_device_id !== peer || runtime.binding.group_id !== context.groupId) return;
  const { binding, owner } = runtime;
  const stats: DesktopWebDavRelayHttpStats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
  const http = authorizeDesktopWebDavRelay(binding, createDesktopWebDavRelayHttp(stats, signal, { recordUsage: recordDesktopWebDavUsage }));
  const cleanup = await captureWebDavRelayCleanup({
    host, signal, attachments: await createDesktopRequestSyncAttachmentHost(host),
    files: createDesktopLibrarySyncFiles(owner.dbPath),
    loadScope: db => readWebDavRelayBodyScope(db, binding, binding.desktop_device_id),
    request: async (url, input, receive) => {
      const active = await current();
      if (active?.owner !== owner || active.binding.id !== binding.id) throw new Error('webdav_relay_scope_changed');
      try { return await http(url, input, receive); }
      finally {
        if (input.method === 'DELETE') appendMainProcessDiagnosticLog('webdav_relay_cleanup', stats);
      }
    }
  }, context, role);
  if (!cleanup) return;
  return {
    ...cleanup,
    async retire() {
      const result = await cleanup.retire();
      if (result) notifyDesktopSyncGroupOverviewChanged();
      return result;
    }
  };
}
