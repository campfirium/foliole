export interface DesktopSyncGroupPeer {
  endpoint_url: string;
  group_id: string;
  local_device_id: string;
  peer_device_id: string;
  peer_device_name: string;
  peer_platform: string;
}

const routes = new Map<string, DesktopSyncGroupPeer>();

export function saveDesktopSyncGroupRoute(route: DesktopSyncGroupPeer) {
  routes.set(route.peer_device_id, route);
  return route;
}

export function removeDesktopSyncGroupRoute(peerDeviceId: string) {
  routes.delete(peerDeviceId);
}

export function clearDesktopSyncGroupRoutes() {
  routes.clear();
}

export function loadDesktopSyncGroupRoutes(groupId: string) {
  return [...routes.values()].filter((route) => route.group_id === groupId);
}
