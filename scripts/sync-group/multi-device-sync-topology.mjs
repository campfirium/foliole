import { setTimeout as delay } from 'node:timers/promises';

function isDesktop(device) {
  return !['android-capacitor', 'ios-capacitor']
    .includes(String(device.platform ?? '').toLowerCase());
}

export function expectedDesktopSyncRole(overview) {
  const localId = overview?.current_device?.device_identity_key;
  const desktopIds = (overview?.sync_group?.devices ?? [])
    .filter((device) => device.state === 'active' && isDesktop(device))
    .map((device) => device.device_identity_key).sort();
  if (!localId || !desktopIds.includes(localId)) throw new Error('Desktop topology identity is incomplete.');
  return desktopIds[0] === localId ? 'anchor' : 'member';
}

export async function syncDesktopMemberAfterElection({
  attempts = 30, loadOverview, pause = delay, sync
}) {
  let lastOverview;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastOverview = await loadOverview();
    const expectedRole = expectedDesktopSyncRole(lastOverview);
    if (lastOverview.server_status?.topology_status === 'ready'
        && lastOverview.server_status?.topology_role === expectedRole) {
      return expectedRole === 'member' ? sync() : null;
    }
    await pause(1_000);
  }
  throw new Error(`Desktop topology did not settle: ${JSON.stringify(lastOverview?.server_status ?? null)}`);
}
