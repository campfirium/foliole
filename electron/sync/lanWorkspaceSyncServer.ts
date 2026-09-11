import http from 'node:http';

import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import {
  createLanWorkspaceSyncRequestHandler,
  ATTACHMENT_RESOURCE_PATH,
  DISCOVERY_ENDPOINT_PATH,
  SYNC_GROUP_JOIN_ACCEPTANCE_PATH,
  SYNC_GROUP_JOIN_REQUESTS_PATH,
  SYNC_DIAGNOSTICS_PATH,
  SYNC_PACK_PATH,
  WORKSPACE_SNAPSHOT_PATH,
  WORKSPACE_VERSION_PATH
} from './companionLanRequestHandler.js';
import {
  stopCompanionMdnsAdvertisement
} from './companionMdnsAdvertisement.js';
import { loadDesktopAnchorTopologyState } from './desktopAnchorTopologyRole.js';
import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import { logDesktopDnsSdDiagnostic } from './desktopDnsSdDiagnostics.js';
import { advertiseDesktopSyncGroup } from './desktopSyncGroupAdvertisement.js';
import { startDesktopSyncGroupAutoSync, stopDesktopSyncGroupAutoSync } from './desktopSyncGroupAutoSync.js';
import { loadDesktopSyncGroupJoinProvider } from './desktopSyncGroupJoinProvider.js';
import { collectLanWorkspaceSyncUrls } from './lanWorkspaceSyncNetwork.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

const DEFAULT_SYNC_PORT = 38641;
export const LAN_WORKSPACE_SYNC_HTTP_LIMITS = {
  headersTimeout: 10_000,
  keepAliveTimeout: 2_000,
  requestTimeout: 30_000
} as const;

export interface LanWorkspaceSyncServerStatus {
  advertised_urls: string[];
  last_error: string | null;
  active_device_count: number;
  pending_join_request_count: number;
  port: number | null;
  state: 'failed' | 'running' | 'stopped';
  topology_role: 'anchor' | 'member' | 'observing';
  topology_status: 'observing' | 'ready' | 'waiting_anchor' | 'incompatible' | 'sync_before_demote';
}

function topologyStatus() {
  const topology = loadDesktopAnchorTopologyState();
  return { topology_role: topology.role, topology_status: topology.status };
}

let activeJoinRequestHandler: (() => void) | null = null;
let activeServer: http.Server | null = null;
let activeStart: Promise<LanWorkspaceSyncServerStatus> | null = null;
let activeStatus: LanWorkspaceSyncServerStatus = {
  advertised_urls: [],
  last_error: null,
  active_device_count: 0,
  pending_join_request_count: 0,
  port: null,
  state: 'stopped',
  ...topologyStatus()
};

function resolveLatestGroupStatus() {
  const group = loadDesktopSyncGroup();
  return {
    active_device_count: group?.devices.filter((device) => device.state === 'active').length ?? 0,
    pending_join_request_count: loadDesktopSyncGroupJoinProvider()?.pending().length ?? 0
  };
}

export function refreshLanWorkspaceSyncServerJoinRequestStatus() {
  activeStatus = {
    ...activeStatus,
    ...resolveLatestGroupStatus()
  };
  return activeStatus;
}

function resolveSyncPort() {
  const rawPort = process.env.FOLIOLE_COMPANION_SYNC_PORT;
  if (!rawPort) {
    return DEFAULT_SYNC_PORT;
  }
  const parsed = Number.parseInt(rawPort, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SYNC_PORT;
}

export function setLanWorkspaceSyncJoinRequestHandler(handler: (() => void) | null) {
  activeJoinRequestHandler = handler;
}

export function createWorkspaceSyncHttpServer(args: { appVersion: string; deviceId: string }) {
  const server = http.createServer(
    createLanWorkspaceSyncRequestHandler({
      appVersion: args.appVersion,
      getSyncStatus: () => activeStatus,
      onJoinRequestCreated: activeJoinRequestHandler,
      deviceId: args.deviceId,
      updateGroupStatus: (groupStatus) => {
        activeStatus = { ...activeStatus, ...groupStatus };
      }
    })
  );
  server.headersTimeout = LAN_WORKSPACE_SYNC_HTTP_LIMITS.headersTimeout;
  server.keepAliveTimeout = LAN_WORKSPACE_SYNC_HTTP_LIMITS.keepAliveTimeout;
  server.requestTimeout = LAN_WORKSPACE_SYNC_HTTP_LIMITS.requestTimeout;
  return server;
}

async function listenOnSyncPort(server: http.Server, port: number) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve());
  });
}

function buildRunningStatus(
  port: number,
  groupStatus: ReturnType<typeof resolveLatestGroupStatus>
): LanWorkspaceSyncServerStatus {
  return {
    advertised_urls: collectLanWorkspaceSyncUrls(port),
    last_error: null,
    ...groupStatus,
    port,
    state: 'running',
    ...topologyStatus()
  };
}

function logRunningStatus() {
  console.info('[companion-sync] lan workspace sync server started', {
    endpointPaths: [
      DISCOVERY_ENDPOINT_PATH,
      SYNC_GROUP_JOIN_REQUESTS_PATH,
      SYNC_GROUP_JOIN_ACCEPTANCE_PATH,
      SYNC_PACK_PATH,
      SYNC_DIAGNOSTICS_PATH,
      ATTACHMENT_RESOURCE_PATH,
      WORKSPACE_VERSION_PATH,
      WORKSPACE_SNAPSHOT_PATH
    ],
    ...activeStatus
  });
}

export function applyLanSyncMdnsWarning(
  status: LanWorkspaceSyncServerStatus,
  error: unknown
) {
  return {
    ...status,
    last_error: error instanceof Error ? error.message : 'mDNS advertisement is unavailable.'
  };
}

function recordMdnsWarning(error: unknown) {
  activeStatus = applyLanSyncMdnsWarning(activeStatus, error);
}

async function startLanWorkspaceSyncServer(args: { appVersion: string; deviceId: string }) {
  const group = loadDesktopSyncGroup();
  if (!group || !loadDesktopWorkgroupKey(group.group_id)) throw new Error('sync_group_workgroup_key_missing');
  const groupStatus = resolveLatestGroupStatus();
  startDesktopSyncGroupAutoSync();
  if (activeServer) {
    if (activeStatus.port) await advertiseDesktopSyncGroup({ ...args,
      onWarning: recordMdnsWarning, port: activeStatus.port });
    return activeStatus;
  }

  const port = resolveSyncPort();
  const server = createWorkspaceSyncHttpServer(args);
  try {
    await listenOnSyncPort(server, port);
    logDesktopDnsSdDiagnostic('http_listener_ready', { port });
    await advertiseDesktopSyncGroup({ ...args, onWarning: recordMdnsWarning, port });
    activeServer = server;
    activeStatus = buildRunningStatus(port, groupStatus);
    logRunningStatus();
    return activeStatus;
  } catch (error) {
    stopCompanionMdnsAdvertisement();
    server.close();
    activeStatus = {
      advertised_urls: [],
      last_error: error instanceof Error ? error.message : 'Unknown sync server error.',
      active_device_count: 0,
      pending_join_request_count: 0,
      port: null,
      state: 'failed',
      ...topologyStatus()
    };
    console.error('[companion-sync] lan workspace sync server failed', error);
    return activeStatus;
  }
}

export async function ensureLanWorkspaceSyncServer(args: { appVersion: string; deviceId: string }) {
  if (!isDesktopCompanionSyncParticipating()) return activeStatus;
  if (activeStart) return activeStart;
  const start = startLanWorkspaceSyncServer(args);
  activeStart = start;
  void start.finally(() => {
    if (activeStart === start) activeStart = null;
  }).catch(() => undefined);
  return start;
}

export async function stopLanWorkspaceSyncServer() {
  stopDesktopSyncGroupAutoSync();
  await activeStart?.catch(() => undefined);
  if (!activeServer) {
    activeStatus = {
      advertised_urls: [],
      last_error: null,
      active_device_count: 0,
      pending_join_request_count: 0,
      port: null,
      state: 'stopped',
      ...topologyStatus()
    };
    return activeStatus;
  }

  const server = activeServer;
  activeServer = null;
  stopCompanionMdnsAdvertisement();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  activeStatus = {
    advertised_urls: [],
    last_error: null,
    active_device_count: 0,
    pending_join_request_count: 0,
    port: null,
    state: 'stopped',
    ...topologyStatus()
  };
  return activeStatus;
}

export function getLanWorkspaceSyncServerStatus() {
  return { ...refreshLanWorkspaceSyncServerJoinRequestStatus(), ...topologyStatus() };
}
