import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleMcpMessage, MCP_PROTOCOL_VERSION } from './foliole-mcp-server.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-mcp-virtual-folders-'));
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

describe('foliole mcp virtual folders', () => {
  it('maps read-only virtual folder tools to the Agent Control CLI', async () => {
    const calls = [];
    const state = await initializedState();
    const descriptorPath = await writeDescriptor(['virtualFolders.list', 'virtualFolders.read']);
    const list = await handleMcpMessage(request('tools/call', {
      arguments: { limit: 4 },
      name: 'foliole_virtual_folders_list'
    }), state, {
      descriptor: descriptorPath,
      runAgentCli: async (argv) => {
        calls.push(argv);
        return { output: { virtual_folders: [{ id: 'vf-1', title: 'Set' }] }, status: 0 };
      }
    });
    const read = await handleMcpMessage(request('tools/call', {
      arguments: { id: 'vf-1', limit: 8 },
      name: 'foliole_virtual_folders_read'
    }), state, {
      descriptor: descriptorPath,
      runAgentCli: async (argv) => {
        calls.push(argv);
        return { output: { folder: { id: 'vf-1' }, items: [{ material_id: 'node-1' }] }, status: 0 };
      }
    });

    expect(calls).toEqual([
      ['virtual-folders/list', '--limit', '4', '--descriptor', descriptorPath],
      ['virtual-folders/read', '--id', 'vf-1', '--limit', '8', '--descriptor', descriptorPath]
    ]);
    expect(list.result.isError).toBe(false);
    expect(list.result.content[0].text).toContain('vf-1');
    expect(read.result.isError).toBe(false);
    expect(read.result.content[0].text).toContain('node-1');
  });
});

async function writeDescriptor(capabilities) {
  const descriptorPath = path.join(tempRoot, 'agent-control-session.json');
  await writeFile(descriptorPath, JSON.stringify({
    capabilities,
    endpoint: 'http://127.0.0.1:1',
    token: 'secret-token'
  }));
  return descriptorPath;
}
