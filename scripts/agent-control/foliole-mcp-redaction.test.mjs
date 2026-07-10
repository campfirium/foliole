import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleMcpMessage, MCP_PROTOCOL_VERSION } from './foliole-mcp-server.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-mcp-redaction-'));
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

describe('foliole mcp redaction', () => {
  it('maps read-only tools to runAgentCli argv and redacts sensitive output', async () => {
    const calls = [];
    const state = await initializedState();
    const descriptorPath = await writeDescriptor(['materials.search']);
    const result = await handleMcpMessage(request('tools/call', {
      arguments: { limit: 2, query: 'atlas' },
      name: 'foliole_materials_search'
    }), state, {
      descriptor: descriptorPath,
      env: { FOLIOLE_AGENT_TOKEN: 'secret-token' },
      runAgentCli: async (argv) => {
        calls.push(argv);
        return {
          output: {
            authorization: 'Bearer secret-token',
            descriptor: descriptorPath,
            materials: [{ id: 'node-1' }],
            token: 'secret-token'
          },
          status: 0
        };
      }
    });

    expect(calls).toEqual([['materials/search', '--query', 'atlas', '--limit', '2', '--descriptor', descriptorPath]]);
    expect(result.result.isError).toBe(false);
    const text = result.result.content[0].text;
    expect(text).toContain('node-1');
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain(descriptorPath);
    expect(text).not.toContain('Bearer secret-token');
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
