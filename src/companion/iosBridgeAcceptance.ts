import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { DesktopSyncHttpError, fetchDesktopJson } from '../shared/platform/companionDesktopSyncHttp';
import {
  clearCompanionPairingCredentials,
  createSignedRequestHeaders,
  loadCompanionPairingState
} from '../shared/platform/companionWorkspacePairing';
import {
  loadCompanionWorkspaceSyncState,
  saveCompanionWorkspaceSyncEndpoint
} from '../shared/platform/companionWorkspaceSync';

import { pairIosAcceptanceCompanion } from './iosAcceptancePairing';

export type AcceptanceResult = {
  error: string | null;
  phase: 'applied' | 'background' | 'disconnected' | 'failed' | 'foreground' | 'paired' | 'reapplied' | 'rejected' |
    'migration-verified' | 'resources-restored' | 'resources-synced' | 'ready' | 'route-restarted' |
    'route-saved' | 'intent-waiting' | 'waiting-restarted' | 'grant-consumed' | 'upgraded' |
    'anchor-observed';
  scenario: 'content-resource-read' | 'database-upgrade-runtime' | 'pairing-signed-transport' |
    'device-identity' |
    'foreground-sync-lifecycle' | 'state-writeback-runtime' | 'sync-group-authorization' | 'sync-group-lifecycle' |
    'sync-pack-runtime';
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
  const [pairing, endpoint] = await Promise.allSettled([
    clearCompanionPairingCredentials(),
    saveCompanionWorkspaceSyncEndpoint('')
  ]);
  return {
    endpoint_cleanup_succeeded: endpoint.status === 'fulfilled',
    pairing_cleanup_succeeded: pairing.status === 'fulfilled'
  };
}

async function runInitialPairing(hostName: string, databasePath: string | null) {
  const endpoint = acceptanceEndpoint()!;
  await clearCompanionPairingCredentials();
  await saveCompanionWorkspaceSyncEndpoint('');
  if (!await expectSigningRejected()) throw new Error('Preflight pairing cleanup did not remove signing ability.');
  const pairing = await pairIosAcceptanceCompanion(endpoint, hostName);
  const workspace = await saveCompanionWorkspaceSyncEndpoint(endpoint!);
  const signed = await fetchDesktopJson<{ ok: boolean }>(endpoint!, '/acceptance/signed');
  postResult({
    database_path: databasePath,
    endpoint_restored: workspace.endpoint_url === endpoint,
    error: null,
    pairing_authorization_id: pairing.authorization_id,
    phase: 'paired',
    scenario: 'pairing-signed-transport',
    signed_request_passed: signed.ok === true,
    status: 'passed'
  });
}

async function runRestartAndDisconnect(pairingAuthorizationId: string) {
  const endpoint = acceptanceEndpoint()!;
  const workspace = await loadCompanionWorkspaceSyncState();
  const signed = await fetchDesktopJson<{ ok: boolean }>(endpoint!, '/acceptance/signed');
  const redirectRejected = await expectHttpStatus('/acceptance/redirect', 302);
  const httpErrorPropagated = await expectHttpStatus('/acceptance/error', 503);
  await clearCompanionPairingCredentials();
  await saveCompanionWorkspaceSyncEndpoint('');
  const clearedPairing = await loadCompanionPairingState();
  const clearedWorkspace = await loadCompanionWorkspaceSyncState();
  postResult({
    error: null,
    http_error_propagated: httpErrorPropagated,
    identity_restored: pairingAuthorizationId.length > 0,
    pairing_authorization_id: pairingAuthorizationId,
    endpoint_cleared: clearedWorkspace.endpoint_url === null,
    endpoint_restored: workspace.endpoint_url === endpoint,
    pairing_cleared: clearedPairing.is_paired === false,
    phase: 'disconnected',
    redirect_rejected: redirectRejected,
    scenario: 'pairing-signed-transport',
    signed_after_restart: signed.ok === true,
    signing_rejected_after_disconnect: await expectSigningRejected(),
    status: 'passed'
  });
}

export async function runIosBridgeAcceptance() {
  try {
    const endpoint = acceptanceEndpoint();
    if (!endpoint) throw new Error('iOS pairing acceptance endpoint is unavailable.');
    const bootstrap = await loadCompanionBootstrapState();
    const pairing = await loadCompanionPairingState();
    if (pairing.is_paired) await runRestartAndDisconnect(pairing.authorization_id ?? '');
    else await runInitialPairing(
      bootstrap.host_name ?? 'Acceptance iPhone', bootstrap.database_path
    );
  } catch (error) {
    const cleanup = await bestEffortClearAcceptanceState();
    postResult({
      ...cleanup,
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed',
      scenario: 'pairing-signed-transport',
      status: 'failed'
    });
  }
}
