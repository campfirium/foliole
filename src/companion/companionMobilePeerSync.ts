import { isMobileSyncPlatform } from '../../lib/platform/syncSchedulingPlatform';
import { resolveReachableCompanionWorkspaceSyncEndpoints } from '../shared/platform/companionWorkspaceSync';

import { loadActiveCompanionSyncRun } from './companionSyncRunOwner';
import { tryForegroundAutoSyncTarget } from './companionSyncTargetFlow';
import type { runCompanionStreamSync, TryForegroundAutoSyncArgs } from './companionWorkspaceSyncFlow';

const pending = new Map<string, Promise<void>>();

/** Discovery has no foreground-run ownership; only an actual transfer acquires it. */
export function scheduleCompanionMobilePeerSync(
  endpoint: string, args: TryForegroundAutoSyncArgs, runStream: typeof runCompanionStreamSync
) {
  if (pending.has(endpoint) || args.cancelled()) return;
  const work = discoverAndSync(endpoint, args, runStream).catch(error => {
    if (!args.cancelled()) args.setError(error instanceof Error ? error.message : 'discovery_no_devices');
  }).finally(() => {
    if (pending.get(endpoint) === work) pending.delete(endpoint);
  });
  pending.set(endpoint, work);
}

async function discoverAndSync(
  endpoint: string, args: TryForegroundAutoSyncArgs, runStream: typeof runCompanionStreamSync
) {
  const peers = await resolveReachableCompanionWorkspaceSyncEndpoints(endpoint, {
    allowWhileNotParticipating: args.triggerReason === 'manual', mobilePeersOnly: true
  });
  const targetArgs = { ...args, triggeredAt: new Date().toISOString() };
  delete targetArgs.runId;
  delete targetArgs.onRunIdentified;
  delete targetArgs.continuationMode;
  delete targetArgs.onContinuationModeChange;
  try {
    for (const peer of peers) {
      if (!isMobileSyncPlatform(peer.platform ?? '')) continue;
      let active = loadActiveCompanionSyncRun();
      while (active && !args.cancelled()) {
        await active.completion.catch(() => undefined);
        active = loadActiveCompanionSyncRun();
      }
      if (args.cancelled()) return;
      await tryForegroundAutoSyncTarget(targetArgs, peer, runStream);
    }
  } finally {
    if (!args.cancelled() && !loadActiveCompanionSyncRun()) args.setStatus('idle');
  }
}
