import type { NativeSyncPackApplyResult } from '../../../lib/platform/nativeSyncContract';

import { loadCompanionBootstrapState } from './companionBootstrap';
import { applyCompanionSyncPackPathWithSharedCore } from './companionSyncPackNodes';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import { FolioleCompanionSync } from './companionWorkspaceSyncBridge';

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
    return applyCompanionSyncPackPathWithSharedCore({
      deviceId: bootstrap.device_id,
      packPath: args.packPath
    }, {
      loadCursor: async () => (await FolioleCompanionSync.loadSyncPackCursor()).cursor,
      saveCursor: async (cursor) => (await FolioleCompanionSync.saveSyncPackCursor({ cursor })).cursor
    });
  });
}
