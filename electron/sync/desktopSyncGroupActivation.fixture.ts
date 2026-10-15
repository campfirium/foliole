import { z } from 'zod';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { notifyWorkspaceContentChanged } from '../ipc/workspaceContentChangedEvents.js';

import { setDesktopCompanionSyncEnabled } from './desktopCompanionSyncPreference.js';
import { subscribeDesktopSyncCompleted } from './desktopSyncCoordinator.js';
import { emitActivationService } from './desktopSyncGroupActivationDns.fixture.js';
import { runDesktopManualSyncWithDiscovery, startDesktopSyncGroupAutoSync, stopDesktopSyncGroupAutoSync } from './desktopSyncGroupAutoSync.js';
import { desktopSyncPeerRoundOwner } from './desktopSyncPeerRoundOwner.js';

let releaseBusyRound: (() => void) | undefined;

export async function runActivationFixtureCommand(action: string, args: Readonly<Record<string, unknown>>) {
  if (action === 'activation_start') {
    await runWithDatabaseConnectionOwner(() => setDesktopCompanionSyncEnabled(true));
    await startDesktopSyncGroupAutoSync();
    return null;
  }
  if (action === 'activation_manual') return runDesktopManualSyncWithDiscovery();
  if (action === 'activation_hold_round') {
    releaseBusyRound = desktopSyncPeerRoundOwner().acquireOutbound(z.string().parse(args.peerId), 'busy-fixture')?.release;
    return null;
  }
  if (action === 'activation_release_round') { releaseBusyRound?.(); return null; }
  if (action === 'activation_stop') {
    stopDesktopSyncGroupAutoSync();
    return null;
  }
  if (action === 'activation_mutation') return waitForSync(() => notifyWorkspaceContentChanged());
  const origin = z.string().url().parse(args.origin);
  const payload = z.object({ group_id: z.string(), provider_device_id: z.string(),
    runtime_instance_id: z.string() }).parse(await (await fetch(`${origin}/companion/discovery`)).json());
  const url = new URL(origin);
  return waitForSync(() => emitActivationService('found', {
    addresses: [url.hostname], domain: 'local.', fqdn: `${payload.runtime_instance_id}.local.`,
    host: url.hostname, interfaceIndex: 1, name: payload.runtime_instance_id,
    port: Number(url.port), type: '_foliole-sync._tcp',
    txt: { group_id: payload.group_id, device_id: payload.provider_device_id,
      runtime_instance_id: payload.runtime_instance_id }
  }));
}

function waitForSync(trigger: () => void) {
  return new Promise<void>((resolve, reject) => {
    const stop = subscribeDesktopSyncCompleted(() => { clearTimeout(timer); stop(); resolve(); });
    const timer = setTimeout(() => { stop(); reject(new Error('activation_fixture_sync_timeout')); }, 10_000);
    trigger();
  });
}
