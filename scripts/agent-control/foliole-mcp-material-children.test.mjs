import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleMcpMessage, MCP_PROTOCOL_VERSION } from './foliole-mcp-server.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-mcp-material-children-'));
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

describe('foliole mcp material child listing', () => {
  it('maps child listing tools to the Agent Control CLI', async () => {
    const calls = [];
    const state = await initializedState();
    const descriptorPath = await writeDescriptor(['materials.listChildren']);
    const result = await handleMcpMessage(request('tools/call', {
      arguments: { limit: 3, parent_id: 'folder-1' },
      name: 'foliole_materials_list_children'
    }), state, {
      descriptor: descriptorPath,
      runAgentCli: async (argv) => {
        calls.push(argv);
        return {
          output: { child_count: 1, children: [{ id: 'child-1' }], parent_id: 'folder-1' },
          status: 0
        };
      }
    });

    expect(calls).toEqual([[
      'materials/list-children',
      '--parent-id',
      'folder-1',
      '--limit',
      '3',
      '--descriptor',
      descriptorPath
    ]]);
    expect(result.result.isError).toBe(false);
    expect(result.result.content[0].text).toContain('child-1');
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
