/* global process */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
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
  it('enforces initialize before tools and exposes only foundation tools without a descriptor', async () => {
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
      'foliole_capabilities'
    ]);
    expect(JSON.stringify(listed)).not.toMatch(/update|delete|create|add-items|remove-items|reorder/iu);
  });

  it('does not call read tools when no descriptor is configured', async () => {
    const state = await initializedState();
    let calls = 0;

    const result = await handleMcpMessage(request('tools/call', {
      arguments: { id: 'topic-1' },
      name: 'foliole_materials_read'
    }), state, {
      runAgentCli: async () => {
        calls += 1;
        return { output: {}, status: 0 };
      }
    });

    expect(result.error.message).toBe('unknown_tool');
    expect(calls).toBe(0);
  });

  it('keeps tool schemas aligned to CLI and API field names', () => {
    const search = MCP_TOOLS.find((tool) => tool.name === 'foliole_materials_search');
    const listChildren = MCP_TOOLS.find((tool) => tool.name === 'foliole_materials_list_children');
    const read = MCP_TOOLS.find((tool) => tool.name === 'foliole_materials_read');
    const virtualFoldersList = MCP_TOOLS.find((tool) => tool.name === 'foliole_virtual_folders_list');
    const virtualFoldersRead = MCP_TOOLS.find((tool) => tool.name === 'foliole_virtual_folders_read');

    expect(Object.keys(search.inputSchema.properties).sort()).toEqual(['limit', 'query']);
    expect(search.inputSchema.required).toEqual(['query']);
    expect(search.description).toContain('parent_titles');
    expect(search.description).toContain('anchor_kind/special_kind');
    expect(search.description).toContain('source.readable_material_id');
    expect(Object.keys(listChildren.inputSchema.properties).sort()).toEqual(['limit', 'parent_id']);
    expect(listChildren.inputSchema.required).toBeUndefined();
    expect(listChildren.description).toContain('workspace top-level materials');
    expect(listChildren.description).toContain('parent metadata');
    expect(listChildren.description).toContain('parent_titles');
    expect(listChildren.description).toContain('anchor_kind');
    expect(listChildren.description).toContain('special_kind');
    expect(Object.keys(read.inputSchema.properties)).toEqual(['id']);
    expect(read.inputSchema.required).toEqual(['id']);
    expect(read.description).toContain('direct child summaries');
    expect(read.description).toContain('anchor_kind/special_kind');
    expect(read.inputSchema.properties.id.description).toContain('active context or search results');
    expect(Object.keys(virtualFoldersList.inputSchema.properties)).toEqual(['limit']);
    expect(virtualFoldersList.description).toContain('curated material sets');
    expect(Object.keys(virtualFoldersRead.inputSchema.properties).sort()).toEqual(['id', 'limit']);
    expect(virtualFoldersRead.inputSchema.required).toEqual(['id']);
    expect(virtualFoldersRead.description).toContain('ordered material items');
  });

  it('calls the Agent Control API through the CLI for material reads', async () => {
    const state = await initializedState();
    const requests = [];
    const server = http.createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        requests.push({
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
            id: 'topic-1',
            title: 'Topic',
            content: 'Body'
          }
        }));
      });
    });
    await listen(server);
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const descriptorPath = path.join(tempRoot, 'agent-control-session.json');
    await writeFile(descriptorPath, JSON.stringify({
      capabilities: ['materials.read'],
      endpoint,
      token: 'secret-token'
    }));

    try {
      const result = await handleMcpMessage(request('tools/call', {
        arguments: { id: 'topic-1' },
        name: 'foliole_materials_read'
      }), state, { descriptor: descriptorPath });

      expect(result.result.isError).toBe(false);
      expect(result.result.content[0].text).toContain('topic-1');
      expect(result.result.content[0].text).toContain('child-1');
      expect(requests).toEqual([{
        authorization: 'Bearer secret-token',
        body: { id: 'topic-1' },
        method: 'POST',
        url: '/agent-control/v1/materials/read'
      }]);
    } finally {
      await closeServer(server);
    }
  });

  it('does not call runAgentCli for unknown or write tools', async () => {
    const state = await initializedState();
    let calls = 0;
    for (const name of ['foliole_materials_update', 'foliole_virtual_folders_create', 'foliole_virtual_folders_reorder', 'unknown']) {
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

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
