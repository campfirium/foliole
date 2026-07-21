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

const PHASE_KEY = 'foliole-ios-sync-pack-acceptance-phase';
const PHASES = ['apply', 'reapply', 'corrupt-envelope', 'wrong-target', 'cursor-gap'] as const;
type AcceptancePhase = typeof PHASES[number];

const REJECTION_ERRORS: Partial<Record<AcceptancePhase, string>> = {
  'corrupt-envelope': 'missing_sync_pack_entry',
  'cursor-gap': 'sync_pack_cursor_not_contiguous',
  'wrong-target': 'sync_pack_target_mismatch'
};

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

function loadPhase(): AcceptancePhase {
  const value = localStorage.getItem(PHASE_KEY);
  return PHASES.includes(value as AcceptancePhase) ? value as AcceptancePhase : 'apply';
}

function advancePhase(phase: AcceptancePhase) {
  const next = PHASES[PHASES.indexOf(phase) + 1];
  if (next) localStorage.setItem(PHASE_KEY, next);
}

async function applyPack(endpoint: string, phase: AcceptancePhase) {
  const kind = phase === 'apply' || phase === 'reapply' ? 'legal' : phase;
  const path = `/acceptance/sync-pack/${kind}`;
  return await applyCompanionDesktopSyncPack({
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery: path }),
    url: `${endpoint}${path}`
  });
}

async function runPhase(endpoint: string, phase: AcceptancePhase) {
  const expectedError = REJECTION_ERRORS[phase];
  if (!expectedError) return { apply: await applyPack(endpoint, phase), error: null };
  try {
    await applyPack(endpoint, phase);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expectedError)) return { apply: null, error: message };
    throw new Error(`Unexpected ${phase} rejection: ${message}`);
  }
  throw new Error(`Expected ${phase} rejection was not observed.`);
}

export async function runIosSyncPackAcceptance() {
  try {
    const endpoint = acceptanceEndpoint();
    if (!endpoint) throw new Error('iOS Sync Pack acceptance endpoint is unavailable.');
    const pairing = await loadCompanionPairingState();
    if (!pairing.is_paired) await pairForSyncPack(endpoint);
    const phase = loadPhase();
    const result = await runPhase(endpoint, phase);
    advancePhase(phase);
    postResult({
      ...result,
      phase: REJECTION_ERRORS[phase] ? 'rejected' : phase === 'apply' ? 'applied' : 'reapplied',
      rejection: REJECTION_ERRORS[phase] ? phase : null,
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
