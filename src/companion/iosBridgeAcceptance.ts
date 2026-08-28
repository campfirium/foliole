import { createSignedRequestHeaders } from '../shared/platform/companion/network/signedRequest';
import {
  leaveCompanionSyncGroupDevice,
  loadCompanionSyncGroup
} from '../shared/platform/companion/sync/syncGroupStore';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { DesktopSyncHttpError, fetchDesktopJson } from '../shared/platform/companionDesktopSyncHttp';
import {
  loadCompanionWorkspaceSyncState,
  saveCompanionWorkspaceSyncEndpoint
} from '../shared/platform/companionWorkspaceSync';

import { discoverIosHostedProvider, joinIosAcceptanceSyncGroup } from './iosAcceptanceSyncGroup';

export type AcceptanceResult = {
  error: string | null;
  phase: 'applied' | 'background' | 'disconnected' | 'failed' | 'foreground' | 'paired' | 'reapplied' | 'rejected' |
    'resources-restored' | 'resources-synced' | 'ready' | 'upgraded' | 'anchor-observed' | 'events-observed' |
    'trigger-observed' | 'join-observed' | 'restart-clean';
  scenario: 'content-resource-read' | 'database-upgrade-runtime' | 'sync-group-signed-transport' |
    'device-identity' |
    'foreground-sync-lifecycle' | 'state-writeback-runtime' |
    'sync-pack-runtime' | 'sync-group-discovery-events' | 'sync-trigger-runtime';
  status: 'failed' | 'passed';
  [key: string]: unknown;
};

declare global {
  interface Window {
    webkit?: { messageHandlers?: {
      folioleBridgeAcceptance?: { postMessage(value: AcceptanceResult): void };
    } };
  }
}

export function postResult(result: AcceptanceResult) {
  const receiver = window.webkit?.messageHandlers?.folioleBridgeAcceptance;
  if (!receiver) throw new Error('iOS bridge acceptance receiver is unavailable.');
  receiver.postMessage(result);
}

async function expectSigningRejected() {
  try {
    await createSignedRequestHeaders({ method: 'GET', pathWithQuery: '/acceptance/signed' });
    return false;
  } catch {
    return true;
  }
}

async function expectHttpStatus(endpoint: string, path: string, status: number) {
  try {
    await fetchDesktopJson(endpoint, path);
    return false;
  } catch (error) {
    return error instanceof DesktopSyncHttpError && error.status === status;
  }
}

async function bestEffortClearAcceptanceState() {
  const [group, endpoint] = await Promise.allSettled([
    leaveCompanionSyncGroupDevice(),
    saveCompanionWorkspaceSyncEndpoint('')
  ]);
  return {
    endpoint_cleanup_succeeded: endpoint.status === 'fulfilled',
    sync_group_cleanup_succeeded: group.status === 'fulfilled'
  };
}

async function runInitialJoin(databasePath: string) {
  await leaveCompanionSyncGroupDevice();
  await saveCompanionWorkspaceSyncEndpoint('');
  if (!await expectSigningRejected()) throw new Error('Preflight Sync Group cleanup did not remove signing ability.');
  const { endpointUrl, group } = await joinIosAcceptanceSyncGroup(databasePath);
  const workspace = await saveCompanionWorkspaceSyncEndpoint(endpointUrl);
  const signed = await fetchDesktopJson<{ ok: boolean }>(endpointUrl, '/acceptance/signed');
  postResult({
    database_path: databasePath,
    device_identity_key: group.local_device_identity_key,
    discovery_exact: typeof group.group_tag === 'string' && group.group_tag.length === 32,
    endpoint_restored: workspace.endpoint_url === endpointUrl,
    error: null,
    group_id: group.group_id,
    group_persisted: group.devices.some((device) =>
      device.device_identity_key === group.local_device_identity_key && device.state === 'active'),
    group_tag: group.group_tag,
    phase: 'join-observed',
    scenario: 'sync-group-signed-transport',
    signed_request_passed: signed.ok === true,
    status: 'passed'
  });
}

async function runRestartAndLeave(groupId: string) {
  const { endpointUrl } = await discoverIosHostedProvider();
  const restoredGroup = await loadCompanionSyncGroup();
  const workspace = await loadCompanionWorkspaceSyncState();
  const signed = await fetchDesktopJson<{ ok: boolean }>(endpointUrl, '/acceptance/signed');
  const redirectRejected = await expectHttpStatus(endpointUrl, '/acceptance/redirect', 302);
  const httpErrorPropagated = await expectHttpStatus(endpointUrl, '/acceptance/error', 503);
  await leaveCompanionSyncGroupDevice();
  await saveCompanionWorkspaceSyncEndpoint('');
  const clearedGroup = await loadCompanionSyncGroup();
  const clearedWorkspace = await loadCompanionWorkspaceSyncState();
  postResult({
    error: null,
    http_error_propagated: httpErrorPropagated,
    identity_restored: groupId.length > 0,
    group_id: groupId,
    group_restored: restoredGroup?.group_id === groupId,
    endpoint_cleared: clearedWorkspace.endpoint_url === null,
    endpoint_restored: workspace.endpoint_url === endpointUrl,
    sync_group_left: clearedGroup === null,
    phase: 'disconnected',
    redirect_rejected: redirectRejected,
    scenario: 'sync-group-signed-transport',
    signed_after_restart: signed.ok === true,
    signing_rejected_after_leave: await expectSigningRejected(),
    status: 'passed'
  });
}

export async function runIosBridgeAcceptance() {
  try {
    const bootstrap = await loadCompanionBootstrapState();
    const group = await loadCompanionSyncGroup();
    if (group) await runRestartAndLeave(group.group_id);
    else if (bootstrap.database_path) await runInitialJoin(bootstrap.database_path);
    else throw new Error('iOS acceptance database is unavailable.');
  } catch (error) {
    const cleanup = await bestEffortClearAcceptanceState();
    postResult({
      ...cleanup,
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed',
      scenario: 'sync-group-signed-transport',
      status: 'failed'
    });
  }
}
