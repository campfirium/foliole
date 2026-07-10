import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-cli-material-children-'));
});

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

async function descriptorPath() {
  const filePath = path.join(tempRoot, 'agent-control-session.json');
  await writeFile(filePath, JSON.stringify({
    capabilities: ['materials.listChildren'],
    endpoint: 'http://127.0.0.1:3456',
    protocol_version: 1,
    token: 'secret-token'
  }));
  return filePath;
}

function response(payload, ok = true) {
  return { json: async () => payload, ok };
}

describe('foliole agent material child listing', () => {
  it('calls the material child listing route with optional parent id and limit', async () => {
    const descriptor = await descriptorPath();
    const calls = [];
    const result = await runAgentCli([
      'materials/list-children',
      '--descriptor', descriptor,
      '--parent-id', 'folder-1',
      '--limit', '5'
    ], {
      fetch: async (url, init) => {
        calls.push({ body: init.body, init, url });
        return response({ child_count: 1, children: [{ id: 'child-1' }], parent_id: 'folder-1' });
      }
    });

    expect(result).toEqual({ output: { child_count: 1, children: [{ id: 'child-1' }], parent_id: 'folder-1' }, status: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://127.0.0.1:3456/agent-control/v1/materials/list-children');
    expect(calls[0].init.headers.authorization).toBe('Bearer secret-token');
    expect(JSON.parse(calls[0].body)).toEqual({ limit: 5, parent_id: 'folder-1' });
  });
});
