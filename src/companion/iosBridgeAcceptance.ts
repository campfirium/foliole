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

import { joinIosAcceptanceSyncGroup } from './iosAcceptanceSyncGroup';

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

export function acceptanceEndpoint() {
  return import.meta.env.VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT as string | undefined;
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

async function expectHttpStatus(path: string, status: number) {
  const endpoint = acceptanceEndpoint();
  try {
    await fetchDesktopJson(endpoint!, path);
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
  const endpoint = acceptanceEndpoint()!;
  await leaveCompanionSyncGroupDevice();
  await saveCompanionWorkspaceSyncEndpoint('');
  if (!await expectSigningRejected()) throw new Error('Preflight Sync Group cleanup did not remove signing ability.');
  const group = await joinIosAcceptanceSyncGroup(endpoint, databasePath);
  const workspace = await saveCompanionWorkspaceSyncEndpoint(endpoint!);
  const signed = await fetchDesktopJson<{ ok: boolean }>(endpoint!, '/acceptance/signed');
  postResult({
    database_path: databasePath,
    endpoint_restored: workspace.endpoint_url === endpoint,
    error: null,
    group_id: group.group_id,
    phase: 'join-observed',
    scenario: 'sync-group-signed-transport',
    signed_request_passed: signed.ok === true,
    status: 'passed'
  });
}

async function runRestartAndLeave(groupId: string) {
  const endpoint = acceptanceEndpoint()!;
  const workspace = await loadCompanionWorkspaceSyncState();
  const signed = await fetchDesktopJson<{ ok: boolean }>(endpoint!, '/acceptance/signed');
  const redirectRejected = await expectHttpStatus('/acceptance/redirect', 302);
  const httpErrorPropagated = await expectHttpStatus('/acceptance/error', 503);
  await leaveCompanionSyncGroupDevice();
  await saveCompanionWorkspaceSyncEndpoint('');
  const clearedGroup = await loadCompanionSyncGroup();
  const clearedWorkspace = await loadCompanionWorkspaceSyncState();
  postResult({
    error: null,
    http_error_propagated: httpErrorPropagated,
    identity_restored: groupId.length > 0,
    group_id: groupId,
    endpoint_cleared: clearedWorkspace.endpoint_url === null,
    endpoint_restored: workspace.endpoint_url === endpoint,
    sync_group_left: clearedGroup === null,
    phase: 'disconnected',
    redirect_rejected: redirectRejected,
    scenario: 'sync-group-signed-transport',
    signed_after_restart: signed.ok === true,
    signing_rejected_after_disconnect: await expectSigningRejected(),
    status: 'passed'
  });
}

export async function runIosBridgeAcceptance() {
  try {
    const endpoint = acceptanceEndpoint();
    if (!endpoint) throw new Error('iOS Sync Group acceptance endpoint is unavailable.');
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
