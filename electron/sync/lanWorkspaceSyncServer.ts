import http from 'node:http';
import os from 'node:os';

import {
  createLanWorkspaceSyncRequestHandler,
  ATTACHMENT_RESOURCE_PATH,
  DISCOVERY_ENDPOINT_PATH,
  PAIR_ENDPOINT_PATH,
  PAIR_REQUESTS_ENDPOINT_PATH,
  SYNC_DIAGNOSTICS_PATH,
  SYNC_PACK_PATH,
  WORKSPACE_SNAPSHOT_PATH,
  WORKSPACE_VERSION_PATH
} from './companionLanRequestHandler.js';
import {
  startCompanionMdnsAdvertisement,
  stopCompanionMdnsAdvertisement
} from './companionMdnsAdvertisement.js';
import { countPendingCompanionPairRequests } from './companionPairingRequests.js';
import { countPairedCompanionDevices } from './companionPairingStore.js';

const DEFAULT_SYNC_PORT = 38641;
export const LAN_WORKSPACE_SYNC_HTTP_LIMITS = {
  headersTimeout: 10_000,
  keepAliveTimeout: 2_000,
  requestTimeout: 30_000
} as const;

export interface LanWorkspaceSyncServerStatus {
  advertised_urls: string[];
  last_error: string | null;
  paired_device_count: number;
  pending_pair_request_count: number;
  port: number | null;
  state: 'failed' | 'running' | 'stopped';
}

let activePairRequestHandler: (() => void) | null = null;
let activeServer: http.Server | null = null;
let activeStatus: LanWorkspaceSyncServerStatus = {
  advertised_urls: [],
  last_error: null,
  paired_device_count: 0,
  pending_pair_request_count: 0,
  port: null,
  state: 'stopped'
};

function resolveLatestPairingStatus() {
  return {
    paired_device_count: countPairedCompanionDevices(),
    pending_pair_request_count: countPendingCompanionPairRequests()
  };
}

export function refreshLanWorkspaceSyncServerPairingStatus() {
  activeStatus = {
    ...activeStatus,
    ...resolveLatestPairingStatus()
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

function collectAdvertisedUrls(port: number) {
  const interfaces = os.networkInterfaces();
  const externalUrls = Object.values(interfaces)
    .flatMap((entries) => entries ?? [])
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}`);
  return [...new Set([`http://127.0.0.1:${port}`, ...externalUrls])];
}

export function setLanWorkspaceSyncPairRequestHandler(handler: (() => void) | null) {
  activePairRequestHandler = handler;
}

export function createWorkspaceSyncHttpServer(args: { appVersion: string; peerId: string }) {
  const server = http.createServer(
    createLanWorkspaceSyncRequestHandler({
      appVersion: args.appVersion,
      getSyncStatus: () => activeStatus,
      onPairRequestCreated: activePairRequestHandler,
      peerId: args.peerId,
      updatePairingStatus: (pairing) => {
        activeStatus = { ...activeStatus, ...pairing };
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

function buildRunningStatus(port: number): LanWorkspaceSyncServerStatus {
  return {
    advertised_urls: collectAdvertisedUrls(port),
    last_error: null,
    ...resolveLatestPairingStatus(),
    port,
    state: 'running'
  };
}

function logRunningStatus() {
  console.info('[companion-sync] lan workspace sync server started', {
    endpointPaths: [
      DISCOVERY_ENDPOINT_PATH,
      PAIR_REQUESTS_ENDPOINT_PATH,
      PAIR_ENDPOINT_PATH,
      SYNC_PACK_PATH,
      SYNC_DIAGNOSTICS_PATH,
      ATTACHMENT_RESOURCE_PATH,
      WORKSPACE_VERSION_PATH,
      WORKSPACE_SNAPSHOT_PATH
    ],
    ...activeStatus
  });
}

export async function ensureLanWorkspaceSyncServer(args: { appVersion: string; peerId: string }) {
  if (activeServer) {
    return activeStatus;
  }

  const port = resolveSyncPort();
  const server = createWorkspaceSyncHttpServer(args);
  try {
    await listenOnSyncPort(server, port);
    startCompanionMdnsAdvertisement({
      appVersion: args.appVersion,
      peerId: args.peerId,
      port
    });
    activeServer = server;
    activeStatus = buildRunningStatus(port);
    logRunningStatus();
    return activeStatus;
  } catch (error) {
    server.close();
    activeStatus = {
      advertised_urls: [],
      last_error: error instanceof Error ? error.message : 'Unknown sync server error.',
      paired_device_count: 0,
      pending_pair_request_count: 0,
      port: null,
      state: 'failed'
    };
    console.error('[companion-sync] lan workspace sync server failed', error);
    return activeStatus;
  }
}

export async function stopLanWorkspaceSyncServer() {
  if (!activeServer) {
    activeStatus = {
      advertised_urls: [],
      last_error: null,
      paired_device_count: 0,
      pending_pair_request_count: 0,
      port: null,
      state: 'stopped'
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
    paired_device_count: 0,
    pending_pair_request_count: 0,
    port: null,
    state: 'stopped'
  };
  return activeStatus;
}

export function getLanWorkspaceSyncServerStatus() {
  return refreshLanWorkspaceSyncServerPairingStatus();
}
