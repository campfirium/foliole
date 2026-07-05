// @vitest-environment node
import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  AGENT_CONTROL_HTTP_LIMITS,
  createAgentControlHttpServer,
  ensureAgentControlApiServer,
  stopAgentControlApiServer
} from './agentControlServer.js';
import { AGENT_CONTROL_CAPABILITIES, AGENT_CONTROL_PROTOCOL_VERSION } from './agentControlTypes.js';
import type { AgentControlAuditEvent } from './agentControlTypes.js';

const testRoot = path.join(process.cwd(), '.tmp', 'artifacts', 'agent-control-tests');

function descriptorPathFor(name: string) {
  return path.join(testRoot, `${name}-${process.pid}.json`);
}

async function readJson(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
}

async function responseJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function listenBlocker() {
  const server = http.createServer((_request, response) => response.end('blocked'));
  return new Promise<{ port: number; server: http.Server }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ port: (server.address() as AddressInfo).port, server });
    });
  });
}

function expectedCapabilityStatuses() {
  return AGENT_CONTROL_CAPABILITIES.map((name) => ({
    enabled: name === 'materials.read' ||
      name === 'materials.search' ||
      name === 'virtualFolders.list' ||
      name === 'virtualFolders.read',
    name
  }));
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

afterEach(async () => {
  await stopAgentControlApiServer();
  await fs.rm(testRoot, { force: true, recursive: true });
});

it('starts a loopback-only service and writes a local session descriptor', async () => {
  const descriptorPath = descriptorPathFor('session');
  const status = await ensureAgentControlApiServer({ appVersion: '0.1.0-test', descriptorPath });
  const descriptor = await readJson(descriptorPath);

  expect(status).toMatchObject({ last_error: null, state: 'running' });
  expect(status.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(descriptor).toMatchObject({
    capabilities: AGENT_CONTROL_CAPABILITIES,
    endpoint: status.endpoint,
    protocol_version: AGENT_CONTROL_PROTOCOL_VERSION
  });
  expect(typeof descriptor.token).toBe('string');
  expect(String(descriptor.token).length).toBeGreaterThan(20);
});

it('exposes health without auth and protects token-scoped discovery routes', async () => {
  const descriptorPath = descriptorPathFor('auth');
  const auditEvents: AgentControlAuditEvent[] = [];
  const status = await ensureAgentControlApiServer({
    appVersion: '0.1.0-test',
    auditSink: (event) => {
      auditEvents.push(event);
    },
    descriptorPath
  });
  const descriptor = await readJson(descriptorPath);
  const endpoint = String(status.endpoint);
  const token = String(descriptor.token);

  const health = await fetch(`${endpoint}/agent-control/v1/health`);
  expect(health.status).toBe(200);
  expect(await responseJson(health)).toMatchObject({
    ok: true,
    protocol_version: AGENT_CONTROL_PROTOCOL_VERSION,
    service: 'foliole-agent-control',
    version: '0.1.0-test'
  });

  const missingToken = await fetch(`${endpoint}/agent-control/v1/capabilities`);
  expect(missingToken.status).toBe(401);

  const wrongToken = await fetch(`${endpoint}/agent-control/v1/capabilities`, {
    headers: { authorization: 'Bearer wrong-token' }
  });
  expect(wrongToken.status).toBe(401);

  const capabilities = await fetch(`${endpoint}/agent-control/v1/capabilities`, {
    headers: {
      authorization: `Bearer ${token}`,
      'x-foliole-agent-id': 'codex-local-test'
    }
  });
  expect(capabilities.status).toBe(200);
  expect(await responseJson(capabilities)).toEqual({
    capabilities: expectedCapabilityStatuses(),
    protocol_version: AGENT_CONTROL_PROTOCOL_VERSION
  });

  const verify = await fetch(`${endpoint}/agent-control/v1/auth/verify`, {
    headers: { authorization: `Bearer ${token}` },
    method: 'POST'
  });
  expect(verify.status).toBe(200);
  expect(await responseJson(verify)).toEqual({ ok: true });

  expect(JSON.stringify(auditEvents)).not.toContain(token);
  expect(auditEvents).toEqual(expect.arrayContaining([
    expect.objectContaining({ capability: 'foundation.health', result: 'success' }),
    expect.objectContaining({ capability: 'foundation.capabilities', errorCategory: 'unauthorized', result: 'auth_failed' }),
    expect.objectContaining({ capability: 'foundation.capabilities', callerId: 'codex-local-test', result: 'success' }),
    expect.objectContaining({ capability: 'foundation.auth.verify', result: 'success' })
  ]));
});

it('records non-sensitive failures for unopened routes', async () => {
  const descriptorPath = descriptorPathFor('not-found');
  const auditEvents: AgentControlAuditEvent[] = [];
  const status = await ensureAgentControlApiServer({
    appVersion: '0.1.0-test',
    auditSink: (event) => {
      auditEvents.push(event);
    },
    descriptorPath
  });

  const response = await fetch(`${status.endpoint}/agent-control/v1/materials`);

  expect(response.status).toBe(404);
  expect(await responseJson(response)).toEqual({ error: 'not_found' });
  expect(auditEvents).toEqual([expect.objectContaining({
    capability: 'foundation.route',
    errorCategory: 'not_found',
    result: 'failed'
  })]);
});

it('cleans up descriptor state when stopped', async () => {
  const descriptorPath = descriptorPathFor('stop');
  await ensureAgentControlApiServer({ appVersion: '0.1.0-test', descriptorPath });

  const stopped = await stopAgentControlApiServer();

  expect(stopped).toEqual({ endpoint: null, last_error: null, port: null, state: 'stopped' });
  expect(await fileExists(descriptorPath)).toBe(false);
});

it('reports startup failure without leaving a descriptor when the port is occupied', async () => {
  const descriptorPath = descriptorPathFor('occupied');
  const blocker = await listenBlocker();
  try {
    const status = await ensureAgentControlApiServer({
      appVersion: '0.1.0-test',
      descriptorPath,
      port: blocker.port
    });

    expect(status).toMatchObject({ endpoint: null, port: null, state: 'failed' });
    expect(status.last_error).toContain('EADDRINUSE');
    expect(await fileExists(descriptorPath)).toBe(false);
  } finally {
    await closeServer(blocker.server);
  }
});

it('uses bounded HTTP server timeouts', () => {
  const server = createAgentControlHttpServer({
    appVersion: '0.1.0-test',
    auditSink: () => undefined,
    token: 'token'
  });

  expect(server.headersTimeout).toBe(AGENT_CONTROL_HTTP_LIMITS.headersTimeout);
  expect(server.keepAliveTimeout).toBe(AGENT_CONTROL_HTTP_LIMITS.keepAliveTimeout);
  expect(server.requestTimeout).toBe(AGENT_CONTROL_HTTP_LIMITS.requestTimeout);
});
