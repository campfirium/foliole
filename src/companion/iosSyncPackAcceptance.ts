import { createSignedRequestHeaders } from '../shared/platform/companion/network/signedRequest';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { applyCompanionDesktopSyncPack } from '../shared/platform/companionSyncPackApply';
import { saveCompanionWorkspaceSyncEndpoint } from '../shared/platform/companionWorkspaceSync';

import { ensureIosAcceptanceSyncGroup } from './iosAcceptanceSyncGroup';
import { postResult } from './iosBridgeAcceptance';
import {
  rerunIosNodeVersionRoundtripAcceptance,
  runIosNodeVersionRoundtripAcceptance
} from './iosNodeVersionRoundtripAcceptance';
import {
  advanceIosSyncPackAcceptancePhase,
  loadIosSyncPackAcceptancePhase,
  type IosSyncPackAcceptancePhase
} from './iosSyncPackAcceptancePhase';

const REJECTION_ERRORS: Partial<Record<IosSyncPackAcceptancePhase, string>> = {
  'cursor-gap': 'sync_pack_cursor_not_contiguous',
  'wrong-target': 'sync_pack_target_mismatch'
};

async function prepareSyncGroup(databasePath: string | null) {
  const joined = await ensureIosAcceptanceSyncGroup(databasePath);
  await saveCompanionWorkspaceSyncEndpoint(joined.endpointUrl);
  return joined;
}

async function applyPack(
  endpoint: string,
  peer: { sourceHostName: string; sourcePeerId: string },
  phase: IosSyncPackAcceptancePhase
) {
  const kind = phase === 'apply' || phase === 'reapply' ? 'legal' : phase;
  const path = `/acceptance/sync-pack/${kind}`;
  return await applyCompanionDesktopSyncPack({
    headers: await createSignedRequestHeaders({ endpointUrl: endpoint, method: 'GET', pathWithQuery: path }),
    ...peer,
    url: `${endpoint}${path}`
  });
}

async function runPhase(
  endpoint: string,
  peer: { sourceHostName: string; sourcePeerId: string },
  phase: IosSyncPackAcceptancePhase
) {
  if (phase === 'apply') {
    const initial = await applyPack(endpoint, peer, phase);
    return {
      apply: initial,
      error: null,
      roundtrip: await runIosNodeVersionRoundtripAcceptance(endpoint, peer)
    };
  }
  if (phase === 'reapply') {
    return { apply: null, error: null, roundtrip: await rerunIosNodeVersionRoundtripAcceptance(endpoint, peer) };
  }
  const expectedError = REJECTION_ERRORS[phase];
  if (!expectedError) throw new Error(`Unexpected iOS Sync Pack phase: ${phase}`);
  try {
    await applyPack(endpoint, peer, phase);
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
    const joined = await prepareSyncGroup(bootstrap.database_path);
    const phase = await loadIosSyncPackAcceptancePhase();
    const result = await runPhase(joined.endpointUrl, joined.peer, phase);
    await advanceIosSyncPackAcceptancePhase(phase);
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
