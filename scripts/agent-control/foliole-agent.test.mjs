import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

  it('reorders a virtual folder by material ids through existing item ids', async () => {
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
        return calls.length === 1
          ? response({
            items: [
              { id: 'item-a', material_id: 'node-a' },
              { id: 'item-b', material_id: 'node-b' }
            ]
          })
          : response({ folder_id: 'folder-1', item_ids: ['item-b', 'item-a'] });
      }
    });

    expect(result).toMatchObject({ output: { folder_id: 'folder-1', item_ids: ['item-b', 'item-a'] }, status: 0 });
    expect(result.output.backup_path).toContain('agent-virtual_folder-virtual-folders-reorder-folder-1');
    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:3456/agent-control/v1/virtual-folders/read',
      'http://127.0.0.1:3456/agent-control/v1/virtual-folders/reorder'
    ]);
    expect(JSON.parse(calls[0].body)).toEqual({ id: 'folder-1' });
    expect(JSON.parse(calls[1].body)).toEqual({ folder_id: 'folder-1', item_ids: ['item-b', 'item-a'] });
  });

  it('does not reorder when a material id is not in the virtual folder', async () => {
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

    expect(result).toEqual({ output: { error: 'material_not_in_folder' }, status: 2 });
    expect(calls).toHaveLength(1);
  });

  it('returns structured descriptor and capability errors', async () => {
    const missing = await runAgentCli(['materials/read', '--id', 'node-1'], { env: {} });
    const descriptor = await descriptorPath({ capabilities: ['materials.read'] });
    const disabled = await runAgentCli(['materials/update', '--descriptor', descriptor, '--id', 'node-1', '--expected-updated-at', 't', '--title', 'Next']);

    expect(missing).toEqual({ output: { error: 'descriptor_not_found' }, status: 3 });
    expect(disabled).toEqual({ output: { error: 'capability_disabled' }, status: 3 });
  });

  it('backs up the previous material before update mutation', async () => {
    const descriptor = await descriptorPath();
    const backupDir = path.join(tempRoot, 'backups');
    const calls = [];
    const result = await runAgentCli([
      'materials/update',
      '--descriptor', descriptor,
      '--backup-dir', backupDir,
      '--id', 'node-1',
      '--expected-updated-at', '2026-07-05T00:00:00.000Z',
      '--content', 'New body'
    ], {
      fetch: async (url, init) => {
        calls.push({ body: init.body, url });
        return calls.length === 1
          ? response({ material: material() })
          : response({ material: material({ content: 'New body', updated_at: '2026-07-05T00:01:00.000Z' }) });
      },
      randomId: () => 'run-1'
    });

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:3456/agent-control/v1/materials/read',
      'http://127.0.0.1:3456/agent-control/v1/materials/update'
    ]);
    expect(result.status).toBe(0);
    expect(result.output.backup_path).toContain(backupDir);
    const backup = JSON.parse(await readFile(result.output.backup_path, 'utf8'));
    expect(backup).toMatchObject({
      command: 'materials/update',
      material_id: 'node-1',
      previous_material: { content: 'Old body', title: 'Old title' },
      request_patch: { content: 'New body', expected_updated_at: '2026-07-05T00:00:00.000Z', id: 'node-1' },
      run_id: 'run-1'
    });
    expect(JSON.stringify(backup)).not.toContain('secret-token');
  });

  it('does not mutate when backup source is truncated or backup write fails', async () => {
    const descriptor = await descriptorPath();
    let truncatedCalls = 0;
    const truncated = await runAgentCli(['materials/delete-soft', '--descriptor', descriptor, '--id', 'node-1'], {
      fetch: async () => {
        truncatedCalls += 1;
        return response({ material: material({ content_truncated: true }) });
      }
    });
    const blockedPath = path.join(tempRoot, 'blocked');
    await writeFile(blockedPath, 'not a directory');
    let writeFailureCalls = 0;
    const writeFailure = await runAgentCli(['materials/update', '--descriptor', descriptor, '--backup-dir', blockedPath, '--id', 'node-1', '--expected-updated-at', 't', '--title', 'Next'], {
      fetch: async () => {
        writeFailureCalls += 1;
        return response({ material: material() });
      }
    });

    expect(truncated).toEqual({ output: { error: 'backup_source_truncated' }, status: 4 });
    expect(truncatedCalls).toBe(1);
    expect(writeFailure).toEqual({ output: { error: 'backup_write_failed' }, status: 4 });
    expect(writeFailureCalls).toBe(1);
  });

  it('keeps the backup path when mutation returns a conflict', async () => {
    const descriptor = await descriptorPath();
    const result = await runAgentCli(['materials/delete-soft', '--descriptor', descriptor, '--backup-dir', path.join(tempRoot, 'backups'), '--id', 'node-1'], {
      fetch: async (url) => url.endsWith('/materials/read')
        ? response({ material: material() })
        : response({ error: 'conflict' }, false),
      randomId: () => 'conflict-run'
    });

    expect(result.status).toBe(1);
    expect(result.output).toMatchObject({ backup_path: expect.stringContaining('conflict-run'), error: 'conflict' });
    await expect(readFile(result.output.backup_path, 'utf8')).resolves.toContain('Old body');
  });
});
