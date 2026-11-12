import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-cli-'));
});

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

async function descriptorPath(overrides = {}) {
  const filePath = path.join(tempRoot, 'agent-control-session.json');
  await writeFile(filePath, JSON.stringify({
    capabilities: [
      'foundation.capabilities',
      'materials.read',
      'materials.search',
      'materials.listChildren',
      'materials.update',
      'materials.deleteSoft',
      'virtualFolders.create'
    ],
    endpoint: 'http://127.0.0.1:3456',
    protocol_version: 1,
    token: 'secret-token',
    ...overrides
  }));
  return filePath;
}

function response(payload, ok = true) {
  return { json: async () => payload, ok };
}

function material(overrides = {}) {
  return {
    child_count: 0,
    children: [],
    children_truncated: false,
    content: 'Old body',
    content_char_count: 8,
    content_truncated: false,
    deleted: false,
    id: 'node-1',
    kind: 'topic',
    parent_titles: [],
    title: 'Old title',
    updated_at: '2026-07-05T00:00:00.000Z',
    ...overrides
  };
}

describe('foliole agent cli', () => {
  it('calls a read route through the descriptor without leaking the token', async () => {
    const descriptor = await descriptorPath();
    const calls = [];
    const result = await runAgentCli(['materials/read', '--descriptor', descriptor, '--id', 'node-1'], {
      fetch: async (url, init) => {
        calls.push({ init, url });
        return response({ material: material() });
      }
    });

    expect(result).toEqual({ output: { material: material() }, status: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].init.headers.authorization).toBe('Bearer secret-token');
    expect(JSON.stringify(result.output)).not.toContain('secret-token');
  });

  it('calls capabilities even when the descriptor omits foundation capabilities', async () => {
    const descriptor = await descriptorPath({ capabilities: ['materials.search'] });
    const calls = [];
    const result = await runAgentCli(['capabilities', '--descriptor', descriptor], {
      fetch: async (url, init) => {
        calls.push({ init, url });
        return response({ capabilities: [{ enabled: true, name: 'materials.search' }], protocol_version: 1 });
      }
    });

    expect(result).toEqual({
      output: { capabilities: [{ enabled: true, name: 'materials.search' }], protocol_version: 1 },
      status: 0
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://127.0.0.1:3456/agent-control/v1/capabilities');
    expect(calls[0].init.headers.authorization).toBe('Bearer secret-token');
  });

  it('reorders a virtual folder by material ids directly', async () => {
    const descriptor = await descriptorPath({
      capabilities: ['virtualFolders.read', 'virtualFolders.reorder']
    });
    const calls = [];
    const result = await runAgentCli([
      'virtual-folders/reorder',
      '--descriptor', descriptor,
      '--folder-id', 'folder-1',
      '--material-ids', 'node-b,node-a'
    ], {
      fetch: async (url, init) => {
        calls.push({ body: init.body, url });
        return response({ folder_id: 'folder-1', reordered_count: 2 });
      }
    });

    expect(result).toEqual({ output: { folder_id: 'folder-1', reordered_count: 2 }, status: 0 });
    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:3456/agent-control/v1/virtual-folders/reorder'
    ]);
    expect(JSON.parse(calls[0].body)).toEqual({ folder_id: 'folder-1', material_ids: ['node-b', 'node-a'] });
  });

  it('lets the API validate whether reorder material ids belong to the folder', async () => {
    const descriptor = await descriptorPath({
      capabilities: ['virtualFolders.read', 'virtualFolders.reorder']
    });
    const calls = [];
    const result = await runAgentCli([
      'virtual-folders/reorder',
      '--descriptor', descriptor,
      '--folder-id', 'folder-1',
      '--material-ids', 'node-missing'
    ], {
      fetch: async (url, init) => {
        calls.push({ body: init.body, url });
        return response({ items: [{ id: 'item-a', material_id: 'node-a' }] });
      }
    });

    expect(result.status).toBe(0);
    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:3456/agent-control/v1/virtual-folders/reorder'
    ]);
  });

  it('returns structured descriptor and capability errors', async () => {
    const missing = await runAgentCli(['materials/read', '--id', 'node-1'], {
      env: { FOLIOLE_USER_DATA_PATH: path.join(tempRoot, 'missing-user-data') }
    });
    const descriptor = await descriptorPath({ capabilities: ['materials.read'] });
    const disabled = await runAgentCli(['materials/update', '--descriptor', descriptor, '--id', 'node-1', '--expected-updated-at', 't', '--title', 'Next']);

    expect(missing).toEqual({ output: { error: 'session_unavailable' }, status: 3 });
    expect(disabled).toEqual({ output: { error: 'capability_disabled' }, status: 3 });
  });

  it('rejects the retired backup option before writing', async () => {
    const result = await runAgentCli([
      'materials/update', '--backup-dir', tempRoot, '--id', 'node-1',
      '--expected-updated-at', 'revision', '--title', 'New title'
    ]);

    expect(result).toEqual({ output: { error: 'unsupported_backup_dir' }, status: 2 });
  });

  it('reports a stale material revision as a conflict', async () => {
    const descriptor = await descriptorPath();
    const result = await runAgentCli([
      'materials/delete-soft', '--descriptor', descriptor, '--id', 'node-1'
    ], {
      fetch: async (url) => url.endsWith('/materials/read')
        ? response({ material: material() })
        : response({ error: 'conflict' }, false)
    });

    expect(result).toEqual({ output: { error: 'conflict' }, status: 1 });
  });
});
