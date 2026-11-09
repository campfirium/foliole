import { runWebDavRelayBodyRound } from '../../../../../lib/core/sync/webDavRelayBodyRound.js';
import { readWebDavRelayBodyScope } from '../../../../../lib/core/sync/webDavRelayBodyScope.js';
import type { WebDavRelayBinding } from '../../../../../lib/platform/webDavRelayContract.js';
import { companionDesktopSessionId } from '../network/companionDesktopSession.js';
import { companionFramedFileOwner } from '../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap.js';

import { createCompanionWebDavRelayHttp, type CompanionWebDavHttpStats } from './companionWebDavRelayHttp.js';
import { loadCompanionWebDavRelay } from './companionWebDavRelayStore.js';
import { currentCompanionAttachmentHost } from './framed/companionAttachmentBlockFiles.js';
import { currentCompanionFramedSyncFiles } from './framed/companionFramedSyncFiles.js';
import { currentCompanionRequestSyncDatabaseHost } from './framed/companionRequestSyncDatabaseHost.js';
import { withCompanionRequestSyncLifecycle } from './framed/companionRequestSyncLifecycle.js';
import { loadCurrentCredential } from './syncGroupProviderCredentialStore.js';

export function companionWebDavRelayLanConnected(binding: WebDavRelayBinding) {
  return Boolean(companionDesktopSessionId(binding.desktop_device_id));
}

export function runCompanionWebDavRelayRound(binding: WebDavRelayBinding, stats: CompanionWebDavHttpStats,
  progress: { published: number; applied: number; retries: number }, parent?: AbortSignal) {
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
    return runWebDavRelayBodyRound({
      host, files, scope, groupKey, progress, signal, attachments: await currentCompanionAttachmentHost(host),
      request: createCompanionWebDavRelayHttp(binding.directory_url, files, owner, stats, signal),
      lanConnected: () => companionWebDavRelayLanConnected(binding),
      assertScope: async () => {
        if ((await loadCompanionWebDavRelay())?.id !== binding.id || (await loadScope())?.key !== scope.key) {
          throw new Error('webdav_relay_scope_changed');
        }
      }
    });
  }, parent);
}
