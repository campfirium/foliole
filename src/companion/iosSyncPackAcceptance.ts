import { createSignedRequestHeaders } from '../shared/platform/companion/network/signedRequest';
import { leaveCompanionSyncGroupDevice } from '../shared/platform/companion/sync/syncGroupStore';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { applyCompanionDesktopSyncPack } from '../shared/platform/companionSyncPackApply';
import { saveCompanionWorkspaceSyncEndpoint } from '../shared/platform/companionWorkspaceSync';

import { ensureIosAcceptanceSyncGroup, loadIosAcceptanceSyncPeer } from './iosAcceptanceSyncGroup';
import { postResult } from './iosBridgeAcceptance';
import {
  rerunIosNodeVersionRoundtripAcceptance,
  runIosNodeVersionRoundtripAcceptance
} from './iosNodeVersionRoundtripAcceptance';

const PHASE_KEY = 'foliole-ios-sync-pack-acceptance-phase';
const PHASES = [
  'apply', 'reapply', 'corrupt-envelope', 'wrong-target', 'cursor-gap', 'legacy-format', 'illegal-dag'
] as const;
type AcceptancePhase = typeof PHASES[number];

const REJECTION_ERRORS: Partial<Record<AcceptancePhase, string>> = {
  'corrupt-envelope': 'missing_sync_pack_entry',
  'cursor-gap': 'sync_pack_cursor_not_contiguous',
  'illegal-dag': 'sync_pack_node_version_missing_parent',
  'legacy-format': 'unsupported_sync_pack_format_version',
  'wrong-target': 'sync_pack_target_mismatch'
};

async function prepareSyncGroup(databasePath: string | null) {
  await leaveCompanionSyncGroupDevice();
  await saveCompanionWorkspaceSyncEndpoint('');
  const joined = await ensureIosAcceptanceSyncGroup(databasePath);
  await saveCompanionWorkspaceSyncEndpoint(joined.endpointUrl);
  return joined.endpointUrl;
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
  const peer = await loadIosAcceptanceSyncPeer();
  return await applyCompanionDesktopSyncPack({
    headers: await createSignedRequestHeaders({ endpointUrl: endpoint, method: 'GET', pathWithQuery: path }),
    ...peer,
    url: `${endpoint}${path}`
  });
}

async function runPhase(endpoint: string, phase: AcceptancePhase) {
  if (phase === 'apply') {
    const initial = await applyPack(endpoint, phase);
    return {
      apply: initial,
      error: null,
      roundtrip: await runIosNodeVersionRoundtripAcceptance(endpoint)
    };
  }
  if (phase === 'reapply') {
    return { apply: null, error: null, roundtrip: await rerunIosNodeVersionRoundtripAcceptance(endpoint) };
  }
  const expectedError = REJECTION_ERRORS[phase];
  if (!expectedError) throw new Error(`Unexpected iOS Sync Pack phase: ${phase}`);
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
    const bootstrap = await loadCompanionBootstrapState();
    const endpoint = await prepareSyncGroup(bootstrap.database_path);
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
