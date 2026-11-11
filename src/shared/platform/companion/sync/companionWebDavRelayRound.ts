import { webDavAuthenticationKey } from '../../../../../lib/core/sync/webDavAuthenticationPause.js';
import { runWebDavRelayBodyRound } from '../../../../../lib/core/sync/webDavRelayBodyRound.js';
import { readWebDavRelayBodyScope } from '../../../../../lib/core/sync/webDavRelayBodyScope.js';
import { webDavRelayCredentialReference } from '../../../../../lib/platform/nativeWebDavRelayHttpContract.js';
import { sameWebDavAttachmentPolicy, type WebDavRelayBinding } from '../../../../../lib/platform/webDavRelayContract.js';
import { companionDesktopSessionId } from '../network/companionDesktopSession.js';
import { companionFramedFileOwner } from '../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap.js';

import { createCompanionWebDavRelayHttp, type CompanionWebDavHttpStats } from './companionWebDavRelayHttp.js';
import { loadCompanionWebDavRelay, notifyCompanionWebDavWork } from './companionWebDavRelayStore.js';
import { currentCompanionAttachmentHost } from './framed/companionAttachmentBlockFiles.js';
import { currentCompanionFramedSyncFiles } from './framed/companionFramedSyncFiles.js';
import { currentCompanionRequestSyncDatabaseHost } from './framed/companionRequestSyncDatabaseHost.js';
import { withCompanionRequestSyncLifecycle } from './framed/companionRequestSyncLifecycle.js';
import { loadCurrentCredential } from './syncGroupProviderCredentialStore.js';

export function companionWebDavRelayLanConnected(binding: WebDavRelayBinding) {
  return Boolean(companionDesktopSessionId(binding.desktop_device_id));
}

export function runCompanionWebDavRelayRound(binding: WebDavRelayBinding, stats: CompanionWebDavHttpStats,
  progress: { published: number; applied: number; retries: number }, parent?: AbortSignal, foregroundReceive?: true, manual = false) {
  return withCompanionRequestSyncLifecycle(async signal => {
    const host = await currentCompanionRequestSyncDatabaseHost();
    const owner = companionFramedFileOwner(getIosCompanionDatabaseOwner());
    const files = currentCompanionFramedSyncFiles();
    const credential = await loadCurrentCredential({ group_id: binding.group_id });
    if (credential.device_id !== binding.phone_device_id) throw new Error('webdav_relay_scope_changed');
    const loadScope = () => host.readSnapshot(db => readWebDavRelayBodyScope(db, binding, credential.device_id), signal);
    const scope = await loadScope();
    if (!scope) throw new Error('webdav_relay_lan_baseline_required');
    const encoded = credential.workgroup_key.replaceAll('-', '+').replaceAll('_', '/');
    const groupKey = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
    const authKey = webDavAuthenticationKey(binding, credential.device_id, scope.receiveScope.localEpoch);
    return runWebDavRelayBodyRound({
      host, files, scope, groupKey, progress, signal, requestSend: notifyCompanionWebDavWork, ...(foregroundReceive ? { foregroundReceive } : {}),
      attachments: await currentCompanionAttachmentHost(host),
      ...(authKey ? { authentication: { key: authKey, manual, changed: notifyCompanionWebDavWork } } : {}),
      request: createCompanionWebDavRelayHttp(binding.directory_url, files, owner, stats, signal,
        webDavRelayCredentialReference(binding, scope.receiveScope.localEpoch)),
      lanConnected: () => companionWebDavRelayLanConnected(binding),
      assertScope: async () => {
        const current = await loadScope();
        const active = await loadCompanionWebDavRelay();
        if (active?.id !== binding.id || active.directory_url !== binding.directory_url || active.credential_version !== binding.credential_version ||
          !sameWebDavAttachmentPolicy(active.attachment_policy, binding.attachment_policy) || current?.key !== scope.key || current.outgoing.href !== scope.outgoing.href) {
          throw new Error('webdav_relay_scope_changed');
        }
      }
    });
  }, parent);
}
