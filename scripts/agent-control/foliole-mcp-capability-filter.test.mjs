import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleMcpMessage, MCP_PROTOCOL_VERSION } from './foliole-mcp-server.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-mcp-capabilities-'));
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

async function writeDescriptor(capabilities) {
  const descriptorPath = path.join(tempRoot, 'agent-control-session.json');
  await writeFile(descriptorPath, JSON.stringify({
    capabilities,
    endpoint: 'http://127.0.0.1:1',
    token: 'secret-token'
  }));
  return descriptorPath;
}

describe('foliole mcp capability filtering', () => {
  it('filters listed and callable tools by descriptor capabilities when available', async () => {
    const state = await initializedState();
    const descriptor = await writeDescriptor(['materials.read', 'materials.update', 'virtualFolders.create']);

    const listed = await handleMcpMessage(request('tools/list'), state, { descriptor });
    expect(listed.result.tools.map((tool) => tool.name)).toEqual([
      'foliole_health',
      'foliole_capabilities',
      'foliole_materials_read'
    ]);
    expect(JSON.stringify(listed)).not.toContain('materials_update');
    expect(JSON.stringify(listed)).not.toContain('virtual_folders_create');

    let calls = 0;
    const blocked = await handleMcpMessage(request('tools/call', {
      arguments: { query: 'atlas' },
      name: 'foliole_materials_search'
    }), state, {
      descriptor,
      runAgentCli: async () => {
        calls += 1;
        return { output: {}, status: 0 };
      }
    });

    expect(blocked.error.message).toBe('unknown_tool');
    expect(calls).toBe(0);
  });

  it('does not expose material tools when the configured descriptor cannot be read', async () => {
    const state = await initializedState();
    const missingDescriptor = path.join(tempRoot, 'missing-agent-control-session.json');

    const listed = await handleMcpMessage(request('tools/list'), state, { descriptor: missingDescriptor });
    expect(listed.result.tools.map((tool) => tool.name)).toEqual([
      'foliole_health',
      'foliole_capabilities'
    ]);
  });
});
