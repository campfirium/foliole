import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { saveCompanionWorkspaceSyncEndpoint } from '../shared/platform/companionWorkspaceSync';

import { syncIosAcceptanceRequest } from './iosAcceptanceRequestSync';
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

async function prepareSyncGroup(databasePath: string | null) {
  const joined = await ensureIosAcceptanceSyncGroup(databasePath);
  await saveCompanionWorkspaceSyncEndpoint(joined.endpointUrl);
  return joined;
}

async function runPhase(
  endpoint: string,
  peer: { sourceHostName: string; sourcePeerId: string },
  phase: IosSyncPackAcceptancePhase
) {
  if (phase === 'apply') {
    const initial = await syncIosAcceptanceRequest(endpoint, peer);
    return {
      apply: initial,
      error: null,
      roundtrip: await runIosNodeVersionRoundtripAcceptance(endpoint, peer)
    };
  }
  if (phase === 'reapply') {
    return { apply: null, error: null, roundtrip: await rerunIosNodeVersionRoundtripAcceptance(endpoint, peer) };
  }
  throw new Error(`Unexpected iOS request sync phase: ${phase}`);
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
      phase: phase === 'apply' ? 'applied' : 'reapplied',
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
