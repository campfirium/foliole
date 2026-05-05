import http from 'node:http';
import os from 'node:os';

import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

const DEFAULT_SYNC_PORT = 38641;
const WORKSPACE_VERSION_PATH = '/companion/workspace-version';
const WORKSPACE_SNAPSHOT_PATH = '/companion/workspace-snapshot';

export interface LanWorkspaceSyncServerStatus {
  advertised_urls: string[];
  last_error: string | null;
  port: number | null;
  state: 'failed' | 'running' | 'stopped';
}

let activeServer: http.Server | null = null;
let activeStatus: LanWorkspaceSyncServerStatus = {
  advertised_urls: [],
  last_error: null,
  port: null,
  state: 'stopped'
};

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

function writeJson(response: http.ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

function buildWorkspaceSnapshotPayload(appVersion: string, peerId: string, snapshot: WorkspaceSnapshot | null) {
  return {
    app_version: appVersion,
    exported_at: new Date().toISOString(),
    peer_id: peerId,
    workspace_snapshot: snapshot
  };
}

function buildWorkspaceVersionPayload(appVersion: string, peerId: string, snapshot: WorkspaceSnapshot | null) {
  return {
    app_version: appVersion,
    exported_at: new Date().toISOString(),
    has_snapshot: snapshot !== null,
    peer_id: peerId
  };
}

function createRequestHandler(appVersion: string, peerId: string) {
  return (request: http.IncomingMessage, response: http.ServerResponse) => {
    const requestUrl = request.url ?? '/';
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Origin': '*'
      });
      response.end();
      return;
    }
    if (request.method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (requestUrl === '/health') {
      writeJson(response, 200, { ok: true, peer_id: peerId });
      return;
    }
    const snapshot = loadWorkspaceSnapshot();
    if (requestUrl === WORKSPACE_VERSION_PATH) {
      writeJson(response, 200, buildWorkspaceVersionPayload(appVersion, peerId, snapshot));
      return;
    }
    if (requestUrl !== WORKSPACE_SNAPSHOT_PATH) {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }
    writeJson(response, 200, buildWorkspaceSnapshotPayload(appVersion, peerId, snapshot));
  };
}

export async function ensureLanWorkspaceSyncServer(args: { appVersion: string; peerId: string }) {
  if (activeServer) {
    return activeStatus;
  }

  const port = resolveSyncPort();
  const server = http.createServer(createRequestHandler(args.appVersion, args.peerId));

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => resolve());
    });
    activeServer = server;
    activeStatus = {
      advertised_urls: collectAdvertisedUrls(port),
      last_error: null,
      port,
      state: 'running'
    };
    console.info('[companion-sync] lan workspace sync server started', {
      endpointPaths: [WORKSPACE_VERSION_PATH, WORKSPACE_SNAPSHOT_PATH],
      ...activeStatus
    });
    return activeStatus;
  } catch (error) {
    server.close();
    activeStatus = {
      advertised_urls: [],
      last_error: error instanceof Error ? error.message : 'Unknown sync server error.',
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
      port: null,
      state: 'stopped'
    };
    return activeStatus;
  }

  const server = activeServer;
  activeServer = null;
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
    port: null,
    state: 'stopped'
  };
  return activeStatus;
}

export function getLanWorkspaceSyncServerStatus() {
  return activeStatus;
}
