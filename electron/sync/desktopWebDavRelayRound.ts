import { WebDavAuthenticationError } from '../../lib/core/sync/webDavAuthenticationPause.js';
import { hasWebDavRelayAttachmentsToSend } from '../../lib/core/sync/webDavRelayAttachments.js';
import { hasWebDavRelayBodyToSend } from '../../lib/core/sync/webDavRelayBodyOutbox.js';
import { runWebDavRelayBodyRound } from '../../lib/core/sync/webDavRelayBodyRound.js';
import { readWebDavRelayBodyScope, type WebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { isWebDavRelayReceiveDue } from '../../lib/core/sync/webDavRelayReceiveFreshness.js';
import { hasWebDavRelayRepairToSend } from '../../lib/core/sync/webDavRelayRepairOutbox.js';
import { isRetryableWebDavSendError } from '../../lib/core/sync/webDavTransportRetry.js';
import { sameWebDavAttachmentPolicy, type WebDavRelayBinding } from '../../lib/platform/webDavRelayContract.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import { createDesktopLibrarySyncFiles } from './desktopFramedSyncFiles.js';
import { createDesktopRequestSyncAttachmentHost } from './desktopRequestSyncAttachmentHost.js';
import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';
import { recordDesktopSyncActivity, type DesktopSyncActivityContext } from './desktopSyncActivityStore.js';
import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';
import { authorizeDesktopWebDavRelay, desktopWebDavAuthenticationKey } from './desktopWebDavRelayAuthorization.js';
import { createDesktopWebDavRelayHttp, type DesktopWebDavRelayHttpStats } from './desktopWebDavRelayHttp.js';
import { recordDesktopWebDavRelayLog } from './desktopWebDavRelayLog.js';
import { loadDesktopBoundWebDavRelay } from './desktopWebDavRelaySettings.js';
import { desktopWebDavSendWindow } from './desktopWebDavSendWindow.js';
import { recordDesktopWebDavUsage } from './desktopWebDavUsage.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export async function runDesktopWebDavRelayRound(activity: DesktopSyncActivityContext, automaticSignal?: AbortSignal, foregroundReceive?: true) {
  const runtime = await loadRoundRuntime(automaticSignal);
  if (!runtime) return false;
  const { binding, databasePath, groupKey, authenticationKey } = runtime;
  const host = createDesktopRequestSyncDatabaseHost(databasePath);
  const loadScope = () => host.readSnapshot(db => readWebDavRelayBodyScope(db, binding, binding.desktop_device_id));
  const lanConnected = () => desktopSyncChangeSessions().hasSessions(binding.phone_device_id);
  const stats: DesktopWebDavRelayHttpStats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0, httpStatuses: {} };
  const progress = { published: 0, applied: 0, retries: 0 };
  const started = performance.now();
  let attempted = !automaticSignal;
  let completed = false;
  let retryable = false;
  try {
    const scope = await loadScope();
    if (!scope) {
      if (automaticSignal) return false;
      throw new Error('webdav_relay_lan_baseline_required');
    }
    if (foregroundReceive && !await host.readSnapshot(
      db => isWebDavRelayReceiveDue(db, scope.receiveScope), automaticSignal)) return false;
    if (automaticSignal && !foregroundReceive && !await host.readSnapshot(async db =>
      await hasWebDavRelayBodyToSend(db, scope) || await hasWebDavRelayAttachmentsToSend(db, scope) || await hasWebDavRelayRepairToSend(db, scope), automaticSignal)) return false;
    if (lanConnected() || automaticSignal?.aborted) return false;
    const attachments = await createDesktopRequestSyncAttachmentHost(host);
    if (lanConnected() || automaticSignal?.aborted) return false;
    attempted = true;
    await runWebDavRelayBodyRound({
      host, scope, groupKey, progress, lanConnected, attachments, requestSend: desktopWebDavSendWindow.request, ...(foregroundReceive ? { foregroundReceive } : {}),
      files: createDesktopLibrarySyncFiles(databasePath),
      ...(automaticSignal ? { signal: automaticSignal } : {}),
      request: authorizeDesktopWebDavRelay(binding,
        createDesktopWebDavRelayHttp(stats, automaticSignal, { recordUsage: recordDesktopWebDavUsage }), authenticationKey),
      ...(authenticationKey ? { authentication: { key: authenticationKey, manual: !automaticSignal,
        changed: notifyDesktopSyncGroupOverviewChanged } } : {}),
      assertScope: async () => assertDesktopRelayScope(binding, scope, await loadScope(), authenticationKey)
    });
    completed = true;
    return true;
  } catch (error) {
    if (automaticSignal && error instanceof WebDavAuthenticationError && error.deferred) {
      attempted = false;
      return false;
    }
    retryable = isRetryableWebDavSendError(error);
    throw error;
  } finally {
    if (Object.keys(stats.requests).length > 0) notifyDesktopSyncGroupOverviewChanged();
    if (attempted) await recordRound(activity, stats, {
      ...progress, elapsedMs: Math.round(performance.now() - started), retryable,
      status: completed ? 'completed' : automaticSignal?.aborted ? 'cancelled' : 'failed'
    });
  }
}

function loadRoundRuntime(automaticSignal?: AbortSignal) {
  return runWithDatabaseConnectionOwner(() => {
    if (automaticSignal?.aborted || !isDesktopCompanionSyncParticipating()) return null;
    const binding = loadDesktopBoundWebDavRelay();
    if (!binding || desktopSyncChangeSessions().hasSessions(binding.phone_device_id)) return null;
    const key = loadDesktopWorkgroupKey(binding.group_id);
    if (!key) throw new Error('sync_group_workgroup_key_missing');
    return { binding, databasePath: openDatabaseConnection().dbPath, groupKey: Buffer.from(key.group_key, 'base64url'),
      authenticationKey: desktopWebDavAuthenticationKey(binding) };
  });
}

async function assertDesktopRelayScope(binding: WebDavRelayBinding,
  scope: WebDavRelayBodyScope, current: WebDavRelayBodyScope | null, authenticationKey?: string) {
  const active = await runWithDatabaseConnectionOwner(() => {
    const binding = isDesktopCompanionSyncParticipating() && loadDesktopBoundWebDavRelay();
    return binding && desktopWebDavAuthenticationKey(binding) === authenticationKey ? binding : null;
  });
  if (!active || active.id !== binding.id || active.directory_url !== binding.directory_url ||
      active.credential_version !== binding.credential_version ||
      !sameWebDavAttachmentPolicy(active.attachment_policy, binding.attachment_policy) ||
      current?.key !== scope.key || current.outgoing.href !== scope.outgoing.href) throw new Error('webdav_relay_scope_changed');
}

async function recordRound(activity: DesktopSyncActivityContext, stats: DesktopWebDavRelayHttpStats,
  result: Parameters<typeof recordDesktopWebDavRelayLog>[2]) {
  await recordDesktopWebDavRelayLog('sync', stats, result);
  const { published, applied, retries, elapsedMs } = result;
  const metrics = JSON.stringify({ ...stats, published, applied, retries, elapsedMs });
  await recordDesktopSyncActivity(activity, { direction: 'exchange', kind: 'stage_finished',
    stage: 'sync_pack', status: result.status === 'completed' ? 'completed' : 'failed', message: `WebDAV relay ${metrics}` });
}
