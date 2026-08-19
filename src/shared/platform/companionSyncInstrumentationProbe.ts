import type { NativeSyncPackApplyResult } from '../../../lib/platform/nativeSyncContract';

import { loadCompanionBootstrapState } from './companionBootstrap';
import { loadCompanionSyncPackCursor, saveCompanionSyncPackCursor } from './companionSyncCursors';
import { applyCompanionSyncPackPathWithSharedCore } from './companionSyncPackNodes';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import { loadCompanionPairingState } from './companionWorkspacePairing';

const PROBE_QUERY_KEY = 'foliole-sync-probe';

interface CompanionSyncApplyProbe {
  applyPackPath(args: { packPath: string }): Promise<NativeSyncPackApplyResult>;
}

declare global {
  interface Window {
    __FOLIOLE_COMPANION_SYNC_APPLY_PROBE__?: CompanionSyncApplyProbe;
  }
}

export function installCompanionSyncInstrumentationProbe() {
  if (!shouldInstallCompanionSyncInstrumentationProbe()) {
    return;
  }
  window.__FOLIOLE_COMPANION_SYNC_APPLY_PROBE__ = {
    applyPackPath: applyPackPathThroughSharedCore
  };
}

function shouldInstallCompanionSyncInstrumentationProbe() {
  if (typeof window === 'undefined') {
    return false;
  }
  return new URL(window.location.href).searchParams.get(PROBE_QUERY_KEY) === '1';
}

async function applyPackPathThroughSharedCore(args: { packPath: string }) {
  if (!args.packPath.trim()) {
    throw new Error('Missing sync pack path.');
  }
  return runCompanionSyncWriterTask(async () => {
    const bootstrap = await loadCompanionBootstrapState();
    const pairing = await loadCompanionPairingState();
    const sourcePeerId = pairing.remote_peer_id?.trim();
    if (!sourcePeerId) throw new Error('sync_pack_source_identity_unavailable');
    return applyCompanionSyncPackPathWithSharedCore({
      deviceId: bootstrap.device_id,
      ...(bootstrap.host_name ? { hostName: bootstrap.host_name } : {}),
      packPath: args.packPath,
      sourcePeerId
    }, {
      loadCursor: loadCompanionSyncPackCursor,
      saveCursor: saveCompanionSyncPackCursor
    });
  });
}
