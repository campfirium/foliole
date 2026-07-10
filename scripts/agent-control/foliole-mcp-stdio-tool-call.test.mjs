/* global process */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MCP_PROTOCOL_VERSION } from './foliole-mcp-server.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-mcp-stdio-'));
});

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

function request(method, params = {}, id = 1) {
  return { id, jsonrpc: '2.0', method, params };
}

describe('foliole mcp stdio tool call', () => {
  it('serves material reads through the spawned MCP stdio process', async () => {
    const apiRequests = [];
    const apiServer = await createAgentControlApi(apiRequests);
    const descriptorPath = path.join(tempRoot, 'agent-control-session.json');
    const tracePath = path.join(tempRoot, 'mcp-trace.jsonl');
    await writeFile(descriptorPath, JSON.stringify({
      capabilities: ['materials.read'],
      endpoint: `http://127.0.0.1:${apiServer.address().port}`,
      token: 'secret-token'
    }));

    try {
      const result = await runMcpStdio(descriptorPath, tracePath, [
        request('initialize', { protocolVersion: MCP_PROTOCOL_VERSION }, 'init'),
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        request('tools/call', {
          arguments: { id: 'topic-1' },
          name: 'foliole_materials_read'
        }, 'read')
      ]);

      expect(result.code).toBe(0);
      const readResult = result.messages.find((message) => message.id === 'read');
      expect(readResult.result.isError).toBe(false);
      expect(readResult.result.content[0].text).toContain('topic-1');
      expect(readResult.result.content[0].text).toContain('child-1');
      expect(readResult.result.content[0].text).toContain('"special_kind":"virtual-root"');
      expect(readResult.result.content[0].text).toContain('"anchor_kind":"highlight"');
      const traceText = await readFile(tracePath, 'utf8');
      expect(traceText).toContain('"tool":"foliole_materials_read"');
      expect(traceText).toContain('"status":"ok"');
      expect(traceText).not.toContain('secret-token');
      expect(traceText).not.toContain(descriptorPath);
      expect(apiRequests).toEqual([{
        authorization: 'Bearer secret-token',
        body: { id: 'topic-1' },
        method: 'POST',
        url: '/agent-control/v1/materials/read'
      }]);
    } finally {
      await closeServer(apiServer);
    }
  });
});

async function createAgentControlApi(apiRequests) {
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      apiRequests.push({
        authorization: request.headers.authorization,
        body: JSON.parse(body),
        method: request.method,
        url: request.url
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        material: {
          child_count: 1,
          children: [{ id: 'child-1', title: 'Child' }],
          content: 'Body',
          id: 'topic-1',
          special_kind: 'virtual-root',
          anchor_kind: 'highlight',
          title: 'Topic'
        }
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function runMcpStdio(descriptorPath, tracePath, messages) {
  const child = spawn(process.execPath, ['scripts/agent-control/foliole-mcp-server.mjs', '--descriptor', descriptorPath], {
    cwd: path.resolve('.'),
    env: { ...process.env, FOLIOLE_AGENT_MCP_TRACE_PATH: tracePath }
  });
  let stdout = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stdin.end(messages.map((message) => JSON.stringify(message)).join('\n'));
  const code = await new Promise((resolve) => child.on('close', resolve));
  return {
    code,
    messages: stdout.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line))
  };
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
