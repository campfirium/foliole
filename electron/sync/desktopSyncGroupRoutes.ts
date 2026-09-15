import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

const MOBILE_GUIDE_ROUTE_SETTING = 'sync_group_pending_mobile_guide_route';

export interface DesktopSyncGroupPeer {
  endpoint_url: string;
  group_id: string;
  local_device_id: string;
  peer_device_id: string;
  peer_device_name: string;
  peer_platform: string;
  route_kind?: 'anchor' | 'member' | 'mobile_guide';
}

const routes = new Map<string, DesktopSyncGroupPeer>();

export function saveDesktopSyncGroupRoute(route: DesktopSyncGroupPeer) {
  routes.set(route.peer_device_id, route);
  if (route.route_kind === 'mobile_guide') saveJsonSetting(MOBILE_GUIDE_ROUTE_SETTING, route);
  return route;
}

export function removeDesktopSyncGroupRoute(peerDeviceId: string) {
  if (routes.get(peerDeviceId)?.route_kind === 'mobile_guide') {
    saveJsonSetting(MOBILE_GUIDE_ROUTE_SETTING, null);
  }
  routes.delete(peerDeviceId);
}

export function clearDesktopSyncGroupRoutes() {
  routes.clear();
}

export function loadDesktopSyncGroupRoutes(groupId: string) {
  return [...routes.values()].filter((route) => route.group_id === groupId);
}

export function restoreDesktopSyncGroupMobileGuideRoute(groupId: string) {
  const route = parsePersistedRoute(loadJsonSetting(MOBILE_GUIDE_ROUTE_SETTING));
  if (!route || route.group_id !== groupId) return null;
  routes.set(route.peer_device_id, route);
  return route;
}

function parsePersistedRoute(value: unknown): DesktopSyncGroupPeer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const route = value as Partial<DesktopSyncGroupPeer>;
  const keys: Array<keyof DesktopSyncGroupPeer> = [
    'endpoint_url', 'group_id', 'local_device_id', 'peer_device_id',
    'peer_device_name', 'peer_platform'
  ];
  if (route.route_kind !== 'mobile_guide' || keys.some((key) =>
    typeof route[key] !== 'string' || !(route[key] as string).trim())) return null;
  return route as DesktopSyncGroupPeer;
}
