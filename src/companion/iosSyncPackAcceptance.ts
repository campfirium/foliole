import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { applyCompanionDesktopSyncPack } from '../shared/platform/companionSyncPackApply';
import {
  clearCompanionPairingCredentials,
  createSignedRequestHeaders,
  loadCompanionPairingState,
  pairCompanionWithDesktop,
  requestCompanionPairing
} from '../shared/platform/companionWorkspacePairing';
import { saveCompanionWorkspaceSyncEndpoint } from '../shared/platform/companionWorkspaceSync';

import { acceptanceEndpoint, postResult } from './iosBridgeAcceptance';

const LEGAL_PACK_PATH = '/acceptance/sync-pack/legal';

async function pairForSyncPack(endpoint: string) {
  const bootstrap = await loadCompanionBootstrapState();
  await clearCompanionPairingCredentials();
  await saveCompanionWorkspaceSyncEndpoint('');
  const pending = await requestCompanionPairing({
    deviceId: bootstrap.device_id,
    deviceKind: 'ios-capacitor',
    deviceName: bootstrap.device_name ?? 'Acceptance iPhone',
    endpointUrl: endpoint
  });
  await pairCompanionWithDesktop({
    deviceKind: 'ios-capacitor',
    deviceName: bootstrap.device_name ?? 'Acceptance iPhone',
    endpointUrl: endpoint,
    pairRequestId: pending.pair_request_id
  });
  await saveCompanionWorkspaceSyncEndpoint(endpoint);
}

async function applyLegalPack(endpoint: string) {
  return await applyCompanionDesktopSyncPack({
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery: LEGAL_PACK_PATH }),
    url: `${endpoint}${LEGAL_PACK_PATH}`
  });
}

export async function runIosSyncPackAcceptance() {
  try {
    const endpoint = acceptanceEndpoint();
    if (!endpoint) throw new Error('iOS Sync Pack acceptance endpoint is unavailable.');
    const pairing = await loadCompanionPairingState();
    if (!pairing.is_paired) await pairForSyncPack(endpoint);
    const apply = await applyLegalPack(endpoint);
    postResult({
      apply,
      error: null,
      phase: pairing.is_paired ? 'reapplied' : 'applied',
      scenario: 'sync-pack-runtime',
      status: 'passed'
    });
  } catch (error) {
    postResult({
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed',
      scenario: 'sync-pack-runtime',
      status: 'failed'
    });
  }
}
