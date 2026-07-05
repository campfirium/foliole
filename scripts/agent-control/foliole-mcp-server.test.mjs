/* global process */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleMcpLine, handleMcpMessage, MCP_PROTOCOL_VERSION, MCP_TOOLS } from './foliole-mcp-server.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-mcp-'));
});

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

function request(method, params = {}, id = 1) {
  return { id, jsonrpc: '2.0', method, params };
}

async function initializedState() {
  const state = {};
  await handleMcpMessage(request('initialize', { protocolVersion: MCP_PROTOCOL_VERSION }), state);
  await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, state);
  return state;
}

describe('foliole mcp server', () => {
  it('enforces initialize before tools and exposes the fixed tool allowlist', async () => {
    const state = {};
    const blocked = await handleMcpMessage(request('tools/list'), state);
    const init = await handleMcpMessage(request('initialize', { protocolVersion: MCP_PROTOCOL_VERSION }, 'init'), state);
    const notification = await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, state);
    const listed = await handleMcpMessage(request('tools/list', {}, 'list'), state);

    expect(blocked.error.message).toBe('not_initialized');
    expect(init.result).toMatchObject({ protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } } });
    expect(notification).toBeNull();
    expect(listed.result.tools.map((tool) => tool.name)).toEqual([
      'foliole_health',
      'foliole_capabilities',
      'foliole_materials_search',
      'foliole_materials_read'
    ]);
    expect(JSON.stringify(listed)).not.toMatch(/update|delete|virtual/iu);
  });

  it('keeps tool schemas aligned to CLI and API field names', () => {
    const search = MCP_TOOLS.find((tool) => tool.name === 'foliole_materials_search');
    const read = MCP_TOOLS.find((tool) => tool.name === 'foliole_materials_read');

    expect(Object.keys(search.inputSchema.properties).sort()).toEqual(['limit', 'query']);
    expect(search.inputSchema.required).toEqual(['query']);
    expect(Object.keys(read.inputSchema.properties)).toEqual(['id']);
    expect(read.inputSchema.required).toEqual(['id']);
  });

  it('maps read-only tools to runAgentCli argv and redacts sensitive output', async () => {
    const calls = [];
    const state = await initializedState();
    const result = await handleMcpMessage(request('tools/call', {
      arguments: { limit: 2, query: 'atlas' },
      name: 'foliole_materials_search'
    }), state, {
      descriptor: 'C:\\Users\\secret\\agent.json',
      env: { FOLIOLE_AGENT_TOKEN: 'secret-token' },
      runAgentCli: async (argv) => {
        calls.push(argv);
        return {
          output: {
            authorization: 'Bearer secret-token',
            descriptor: 'C:\\Users\\secret\\agent.json',
            materials: [{ id: 'node-1' }],
            token: 'secret-token'
          },
          status: 0
        };
      }
    });

    expect(calls).toEqual([['materials/search', '--query', 'atlas', '--limit', '2', '--descriptor', 'C:\\Users\\secret\\agent.json']]);
    expect(result.result.isError).toBe(false);
    const text = result.result.content[0].text;
    expect(text).toContain('node-1');
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('C:\\Users\\secret\\agent.json');
    expect(text).not.toContain('Bearer secret-token');
  });

  it('does not call runAgentCli for unknown, write, or virtual tools', async () => {
    const state = await initializedState();
    let calls = 0;
    for (const name of ['foliole_materials_update', 'foliole_virtual_folders_create', 'unknown']) {
      const result = await handleMcpMessage(request('tools/call', { arguments: {}, name }), state, {
        runAgentCli: async () => {
          calls += 1;
          return { output: {}, status: 0 };
        }
      });
      expect(result.error.message).toBe('unknown_tool');
    }
    expect(calls).toBe(0);
  });

  it('returns safe JSON-RPC errors for malformed and invalid requests', async () => {
    const malformed = await handleMcpLine('{nope');
    const invalidId = await handleMcpMessage({ id: {}, jsonrpc: '2.0', method: 'tools/list' });

    expect(malformed).toEqual({ error: { code: -32700, message: 'parse_error' }, id: null, jsonrpc: '2.0' });
    expect(invalidId).toEqual({ error: { code: -32600, message: 'invalid_request' }, id: null, jsonrpc: '2.0' });
  });

  it('keeps spawned stdio output to JSON-RPC and does not leak descriptor data', async () => {
    const descriptorPath = path.join(tempRoot, 'agent-control-session.json');
    await writeFile(descriptorPath, JSON.stringify({ endpoint: 'http://127.0.0.1:1', token: 'secret-token' }));
    const child = spawn(process.execPath, ['scripts/agent-control/foliole-mcp-server.mjs', '--descriptor', descriptorPath], {
      cwd: path.resolve('.')
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdin.end([
      JSON.stringify(request('initialize', { protocolVersion: MCP_PROTOCOL_VERSION }, 'init')),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify(request('tools/list', {}, 'list'))
    ].join('\n'));

    const code = await new Promise((resolve) => child.on('close', resolve));
    const lines = stdout.trim().split(/\r?\n/u).filter(Boolean);
    expect(code).toBe(0);
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line).jsonrpc)).toEqual(['2.0', '2.0']);
    expect(stdout).not.toContain('secret-token');
    expect(stdout).not.toContain(descriptorPath);
    expect(stderr).not.toContain('secret-token');
    expect(stderr).not.toContain(descriptorPath);
    expect(stderr).not.toMatch(/Authorization|Error:/u);
  });
});
