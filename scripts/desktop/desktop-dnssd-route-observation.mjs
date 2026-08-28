import { setTimeout as delay } from 'node:timers/promises';

/* global process */

export function loadDesktopRoutePeerIds(app, groupId) {
  return app.evaluate(({ app: electronApp }, expectedGroupId) => {
    const moduleApi = process.getBuiltinModule('node:module');
    const pathApi = process.getBuiltinModule('node:path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const mainPath = process.env.FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH
      || pathApi.join(electronApp.getAppPath(), 'main.js');
    const loadModule = moduleApi.createRequire(mainPath);
    const routes = loadModule(pathApi.join(
      pathApi.dirname(mainPath), 'sync', 'desktopSyncGroupRoutes.js'
    )).loadDesktopSyncGroupRoutes(expectedGroupId);
    return routes.map(({ peer_device_id: peerDeviceId }) => peerDeviceId).sort();
  }, groupId);
}

export async function waitForDesktopRoute(app, groupId, peerDeviceId, {
  now = Date.now, timeoutMs = 90_000, wait = delay
} = {}) {
  const deadline = now() + timeoutMs;
  let peerIds = [];
  while (now() < deadline) {
    peerIds = await loadDesktopRoutePeerIds(app, groupId);
    if (peerIds.includes(peerDeviceId)) return { peerDeviceId, routePresent: true };
    await wait(250);
  }
  throw new Error(`Timed out waiting for desktop OS DNS-SD route: ${peerIds.join(',')}`);
}
