import { hasWebDavRelayAttachmentsToSend } from '../../lib/core/sync/webDavRelayAttachments.js';
import { hasWebDavRelayBodyToSend } from '../../lib/core/sync/webDavRelayBodyOutbox.js';
import { runWebDavRelayBodyRound } from '../../lib/core/sync/webDavRelayBodyRound.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import { createDesktopLibrarySyncFiles } from './desktopFramedSyncFiles.js';
import { createDesktopRequestSyncAttachmentHost } from './desktopRequestSyncAttachmentHost.js';
import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';
import { recordDesktopSyncActivity, type DesktopSyncActivityContext } from './desktopSyncActivityStore.js';
import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import { createDesktopWebDavRelayHttp, type DesktopWebDavRelayHttpStats } from './desktopWebDavRelayHttp.js';
import { loadDesktopBoundWebDavRelay } from './desktopWebDavRelaySettings.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export async function runDesktopWebDavRelayRound(activity: DesktopSyncActivityContext, automaticSignal?: AbortSignal) {
  const runtime = await runWithDatabaseConnectionOwner(() => {
    if (automaticSignal?.aborted || !isDesktopCompanionSyncParticipating()) return null;
    const binding = loadDesktopBoundWebDavRelay();
    if (!binding || desktopSyncChangeSessions().hasSessions(binding.phone_device_id)) return null;
    const key = loadDesktopWorkgroupKey(binding.group_id);
    if (!key) throw new Error('sync_group_workgroup_key_missing');
    return { binding, databasePath: openDatabaseConnection().dbPath, groupKey: Buffer.from(key.group_key, 'base64url') };
  });
  if (!runtime) return false;
  const { binding, databasePath, groupKey } = runtime;
  const host = createDesktopRequestSyncDatabaseHost(databasePath);
  const loadScope = () => host.readSnapshot(db => readWebDavRelayBodyScope(db, binding, binding.desktop_device_id));
  const lanConnected = () => desktopSyncChangeSessions().hasSessions(binding.phone_device_id);
  const stats: DesktopWebDavRelayHttpStats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
  const progress = { published: 0, applied: 0, retries: 0 };
  const started = performance.now();
  let attempted = !automaticSignal;
  let completed = false;
  try {
    const scope = await loadScope();
    if (!scope) {
      if (automaticSignal) return false;
      throw new Error('webdav_relay_lan_baseline_required');
    }
    if (automaticSignal && !await host.readSnapshot(async db =>
      await hasWebDavRelayBodyToSend(db, scope) || await hasWebDavRelayAttachmentsToSend(db, scope), automaticSignal)) return false;
    if (lanConnected() || automaticSignal?.aborted) return false;
    const attachments = await createDesktopRequestSyncAttachmentHost(host);
    if (lanConnected() || automaticSignal?.aborted) return false;
    attempted = true;
    await runWebDavRelayBodyRound({
      host, scope, groupKey, progress, lanConnected, attachments, files: createDesktopLibrarySyncFiles(databasePath),
      ...(automaticSignal ? { signal: automaticSignal } : {}),
      request: createDesktopWebDavRelayHttp(stats, automaticSignal),
      assertScope: async () => {
        const current = await loadScope();
        const active = await runWithDatabaseConnectionOwner(() => isDesktopCompanionSyncParticipating() &&
          loadDesktopBoundWebDavRelay()?.id === binding.id);
        if (!active || current?.key !== scope.key || current.outgoing.href !== scope.outgoing.href) throw new Error('webdav_relay_scope_changed');
      }
    });
    completed = true;
    return true;
  } finally {
    if (attempted) {
      const metrics = JSON.stringify({ ...stats, ...progress, elapsedMs: Math.round(performance.now() - started) });
      await recordDesktopSyncActivity(activity, { direction: 'exchange', kind: 'stage_finished',
        stage: 'sync_pack', status: completed ? 'completed' : 'failed', message: `WebDAV relay ${metrics}` });
    }
  }
}
