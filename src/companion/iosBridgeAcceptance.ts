import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { DesktopSyncHttpError, fetchDesktopJson } from '../shared/platform/companionDesktopSyncHttp';
import {
  clearCompanionPairingCredentials,
  createSignedRequestHeaders,
  loadCompanionPairingState,
  pairCompanionWithDesktop,
  requestCompanionPairing
} from '../shared/platform/companionWorkspacePairing';
import {
  loadCompanionWorkspaceSyncState,
  saveCompanionWorkspaceSyncEndpoint
} from '../shared/platform/companionWorkspaceSync';

export type AcceptanceResult = {
  error: string | null;
  phase: 'applied' | 'disconnected' | 'failed' | 'paired' | 'reapplied' | 'rejected' | 'resources-restored' | 'resources-synced' |
    'upgraded';
  scenario: 'content-resource-read' | 'database-upgrade-runtime' | 'pairing-signed-transport' |
    'state-writeback-runtime' | 'sync-pack-runtime';
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

async function runInitialPairing(deviceId: string, deviceName: string) {
  const endpoint = acceptanceEndpoint()!;
  await clearCompanionPairingCredentials();
  await saveCompanionWorkspaceSyncEndpoint('');
  if (!await expectSigningRejected()) throw new Error('Preflight pairing cleanup did not remove signing ability.');
  const pending = await requestCompanionPairing({
    deviceId,
    deviceKind: 'ios-capacitor',
    deviceName,
    endpointUrl: endpoint!
  });
  const pairing = await pairCompanionWithDesktop({
    deviceKind: 'ios-capacitor',
    deviceName,
    endpointUrl: endpoint!,
    pairRequestId: pending.pair_request_id
  });
  const workspace = await saveCompanionWorkspaceSyncEndpoint(endpoint!);
  const signed = await fetchDesktopJson<{ ok: boolean }>(endpoint!, '/acceptance/signed');
  postResult({
    endpoint_restored: workspace.endpoint_url === endpoint,
    error: null,
    pairing_device_id: pairing.device_id,
    phase: 'paired',
    scenario: 'pairing-signed-transport',
    signed_request_passed: signed.ok === true,
    status: 'passed'
  });
}

async function runRestartAndDisconnect(pairingDeviceId: string) {
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
    identity_restored: pairingDeviceId.length > 0,
    pairing_device_id: pairingDeviceId,
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
    if (pairing.is_paired) await runRestartAndDisconnect(pairing.device_id ?? '');
    else await runInitialPairing(bootstrap.device_id, bootstrap.device_name ?? 'Acceptance iPhone');
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
