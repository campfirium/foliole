import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { loadDatabaseDeviceId } from '../../lib/core/database/syncDeviceIdentity.js';
import { openDatabaseConnection } from '../database/connection.js';
import { resolveAppPaths } from '../ipc/paths.js';
import { notifyWorkspaceContentChanged } from '../ipc/workspaceContentChangedEvents.js';

import { createDiagnosticAgentControlAuditSink, type AgentControlAuditSink } from './agentControlAudit.js';
import { createAgentControlRequestHandler } from './agentControlRequestHandler.js';
import { createAgentControlToken } from './agentControlToken.js';
import {
  AGENT_CONTROL_CAPABILITIES,
  AGENT_CONTROL_PROTOCOL_VERSION,
  type AgentControlRuntimeIdentity,
  type AgentControlServerStatus,
  type AgentControlSessionDescriptor
} from './agentControlTypes.js';

export const AGENT_CONTROL_HTTP_LIMITS = {
  headersTimeout: 10_000,
  keepAliveTimeout: 2_000,
  requestTimeout: 10_000
} as const;

const LOOPBACK_HOST = '127.0.0.1';
const SESSION_FILE = 'agent-control-session.json';

let activeServer: http.Server | null = null;
let activeDescriptorPath: string | null = null;
let activeStatus: AgentControlServerStatus = {
  endpoint: null,
  last_error: null,
  port: null,
  state: 'stopped'
};

export function createAgentControlHttpServer(options: { appVersion: string; auditSink: AgentControlAuditSink; notifyWorkspaceContentChanged?: () => void; runtimeIdentity?: AgentControlRuntimeIdentity; token: string }) {
  const server = http.createServer(createAgentControlRequestHandler({
    ...options,
    notifyWorkspaceContentChanged: options.notifyWorkspaceContentChanged ?? notifyWorkspaceContentChanged,
    runtimeIdentity: options.runtimeIdentity ?? createFallbackRuntimeIdentity()
  }));
  server.headersTimeout = AGENT_CONTROL_HTTP_LIMITS.headersTimeout;
  server.keepAliveTimeout = AGENT_CONTROL_HTTP_LIMITS.keepAliveTimeout;
  server.requestTimeout = AGENT_CONTROL_HTTP_LIMITS.requestTimeout;
  return server;
}

function listen(server: http.Server, port: number) {
  return new Promise<number>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off('error', onError);
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    });
  });
}


function createFallbackRuntimeIdentity(): AgentControlRuntimeIdentity {
  const startedAt = new Date().toISOString();
  return {
    boot_id: 'unbound-test-runtime',
    database_device_id_hash: null,
    pid: process.pid,
    started_at: startedAt
  };
}

function hashRuntimeDeviceId(deviceId: string | null) {
  return deviceId ? createHash('sha256').update(deviceId).digest('hex').slice(0, 16) : null;
}

function loadRuntimeDatabaseDeviceId() {
  try {
    return loadDatabaseDeviceId(openDatabaseConnection().driver);
  } catch {
    return null;
  }
}

function createRuntimeIdentity(startedAt: string): AgentControlRuntimeIdentity {
  return {
    boot_id: randomUUID(),
    database_device_id_hash: hashRuntimeDeviceId(loadRuntimeDatabaseDeviceId()),
    pid: process.pid,
    started_at: startedAt
  };
}
function buildDescriptor(endpoint: string, token: string, runtimeIdentity: AgentControlRuntimeIdentity): AgentControlSessionDescriptor {
  return {
    capabilities: [...AGENT_CONTROL_CAPABILITIES],
    endpoint,
    pid: process.pid,
    protocol_version: AGENT_CONTROL_PROTOCOL_VERSION,
    started_at: runtimeIdentity.started_at,
    runtime_identity: runtimeIdentity,
    token
  };
}

async function writeDescriptor(filePath: string, descriptor: AgentControlSessionDescriptor) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
}

export function getAgentControlSessionDescriptorPath() {
  return path.join(resolveAppPaths().app_cache_dir, SESSION_FILE);
}

export async function ensureAgentControlApiServer(args: {
  appVersion: string;
  auditSink?: AgentControlAuditSink;
  descriptorPath?: string;
  port?: number;
}) {
  if (activeServer) return activeStatus;

  const token = createAgentControlToken();
  const runtimeIdentity = createRuntimeIdentity(new Date().toISOString());
  const server = createAgentControlHttpServer({
    appVersion: args.appVersion,
    auditSink: args.auditSink ?? createDiagnosticAgentControlAuditSink(),
    runtimeIdentity,
    token
  });
  try {
    const port = await listen(server, args.port ?? 0);
    const endpoint = `http://${LOOPBACK_HOST}:${port}`;
    const descriptorPath = args.descriptorPath ?? getAgentControlSessionDescriptorPath();
    await writeDescriptor(descriptorPath, buildDescriptor(endpoint, token, runtimeIdentity));
    activeServer = server;
    activeDescriptorPath = descriptorPath;
    activeStatus = { endpoint, last_error: null, port, state: 'running' };
    return activeStatus;
  } catch (error) {
    try {
      server.close();
    } catch {
      // The server can fail before listen opens a handle.
    }
    activeStatus = {
      endpoint: null,
      last_error: error instanceof Error ? error.message : 'Unknown Agent Control API error.',
      port: null,
      state: 'failed'
    };
    return activeStatus;
  }
}

export async function stopAgentControlApiServer() {
  if (!activeServer) {
    activeStatus = { endpoint: null, last_error: null, port: null, state: 'stopped' };
    return activeStatus;
  }

  const server = activeServer;
  const descriptorPath = activeDescriptorPath;
  activeServer = null;
  activeDescriptorPath = null;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  if (descriptorPath) {
    await fs.rm(descriptorPath, { force: true });
  }
  activeStatus = { endpoint: null, last_error: null, port: null, state: 'stopped' };
  return activeStatus;
}

export function getAgentControlApiServerStatus() {
  return activeStatus;
}
