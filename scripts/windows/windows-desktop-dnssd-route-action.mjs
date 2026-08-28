import fs from 'node:fs';
import path from 'node:path';

import { waitForDesktopRoute } from '../desktop/desktop-dnssd-route-observation.mjs';
import { waitForWindowsSyncGroupProviderRelease } from './windows-sync-group-provider-release.mjs';
import {
  invokeWindowsSyncGroupCommand, openWindowsSyncGroupSession
} from './windows-sync-group-recovery-action.mjs';
import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';

const ACTION = 'desktop-dnssd-route-provider';

function joinedRouteIdentity(overview) {
  const group = overview.sync_group;
  const localDeviceId = group?.local_device_identity_key;
  const peer = group?.devices?.filter(({ state }) => state === 'active')
    .find(({ device_identity_key: deviceId }) => deviceId !== localDeviceId);
  if (!overview.sync_enabled || !group?.group_id || !localDeviceId || !peer
      || group.devices.filter(({ state }) => state === 'active').length !== 2) {
    throw new Error('Windows route acceptance requires one enabled two-Device Sync Group.');
  }
  return { groupId: group.group_id, localDeviceId, peerDeviceId: peer.device_identity_key };
}

export async function runWindowsDesktopDnsSdRouteProvider(options) {
  const session = await openWindowsSyncGroupSession(options.paths, options.evidenceRoot);
  const processId = session.app.process().pid;
  let identity;
  let route;
  try {
    identity = joinedRouteIdentity(await invokeWindowsSyncGroupCommand(
      session.page, 'load_sync_group_overview'
    ));
    route = await waitForDesktopRoute(session.app, identity.groupId, identity.peerDeviceId);
    options.reportProgress({ factId: 'desktop-dnssd-route', milestone: 'route-ready' });
    await waitForWindowsSyncGroupProviderRelease({ action: ACTION,
      repoRoot: options.paths.repoRoot });
  } finally {
    await closeWindowsSyncGroupSession(session);
  }
  const manifestPath = path.join(options.evidenceRoot, `${ACTION}-receipt.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity: options.buildIdentity,
    completedAt: new Date().toISOString(), groupId: identity.groupId,
    localDeviceId: identity.localDeviceId, peerDeviceId: route.peerDeviceId,
    processId, resultStatus: 'success', routePresent: true,
    schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { desktopDnsSdRouteProvider: { manifestPath }, output: '' };
}
