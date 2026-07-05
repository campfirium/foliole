// @vitest-environment node
import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-material-errors-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { AGENT_CONTROL_JSON_BODY_LIMIT_BYTES } from './agentControlMaterials.js';
import { createAgentControlHttpServer } from './agentControlServer.js';
import type { AgentControlAuditEvent } from './agentControlTypes.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-control-material-errors-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

async function startServer(auditEvents: AgentControlAuditEvent[]) {
  const server = createAgentControlHttpServer({
    appVersion: '0.1.0-test',
    auditSink: (event) => {
      auditEvents.push(event);
    },
    token: 'test-token'
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function responseJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

function authHeaders() {
  return {
    authorization: 'Bearer test-token',
    'content-type': 'application/json',
    'x-foliole-agent-id': 'codex-local-test'
  };
}

it('returns bounded errors for material read requests', async () => {
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startServer(auditEvents);
  try {
    const unauthorized = await fetch(`${endpoint}/agent-control/v1/materials/read`, { method: 'POST' });
    expect(unauthorized.status).toBe(401);

    const invalidJson = await fetch(`${endpoint}/agent-control/v1/materials/read`, {
      body: '{',
      headers: authHeaders(),
      method: 'POST'
    });
    expect(invalidJson.status).toBe(400);
    expect(await responseJson(invalidJson)).toEqual({ error: 'invalid_json' });

    const tooLarge = await fetch(`${endpoint}/agent-control/v1/materials/read`, {
      body: JSON.stringify({ id: 'a'.repeat(AGENT_CONTROL_JSON_BODY_LIMIT_BYTES) }),
      headers: authHeaders(),
      method: 'POST'
    });
    expect(tooLarge.status).toBe(413);

    const missing = await fetch(`${endpoint}/agent-control/v1/materials/read`, {
      body: JSON.stringify({ id: 'missing' }),
      headers: authHeaders(),
      method: 'POST'
    });
    expect(missing.status).toBe(404);
    expect(await responseJson(missing)).toEqual({ error: 'not_found' });

    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'materials.read', errorCategory: 'unauthorized', result: 'auth_failed' }),
      expect.objectContaining({ capability: 'materials.read', errorCategory: 'invalid_json', result: 'failed' }),
      expect.objectContaining({ capability: 'materials.read', errorCategory: 'request_body_too_large', result: 'failed' }),
      expect.objectContaining({ capability: 'materials.read', errorCategory: 'not_found', targetId: 'missing', result: 'failed' })
    ]));
  } finally {
    await closeServer(server);
  }
});

it('rejects empty search queries without logging the query body', async () => {
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startServer(auditEvents);
  try {
    const response = await fetch(`${endpoint}/agent-control/v1/materials/search`, {
      body: JSON.stringify({ query: '   ' }),
      headers: authHeaders(),
      method: 'POST'
    });

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({ error: 'invalid_request' });
    expect(auditEvents).toContainEqual(expect.objectContaining({
      capability: 'materials.search',
      errorCategory: 'invalid_request',
      result: 'failed'
    }));
    expect(JSON.stringify(auditEvents)).not.toContain('query');
  } finally {
    await closeServer(server);
  }
});
