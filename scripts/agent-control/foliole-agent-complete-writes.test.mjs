import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';

let tempRoot;
let descriptor;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-complete-writes-'));
  descriptor = path.join(tempRoot, 'descriptor.json');
  await writeFile(descriptor, JSON.stringify({
    capabilities: [
      'materials.create', 'materials.read', 'materials.listChildren', 'materials.move', 'materials.reorder',
      'materials.restore', 'virtualFolders.read', 'virtualFolders.update', 'virtualFolders.deleteSoft',
      'virtualFolders.restore'
    ],
    endpoint: 'http://127.0.0.1:3456', token: 'secret-token'
  }));
});

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

it('creates a root Topic with a pre-write backup and structured body', async () => {
  const calls = [];
  const result = await runAgentCli([
    'materials/create', '--descriptor', descriptor, '--backup-dir', path.join(tempRoot, 'backups'),
    '--kind', 'topic', '--title', 'Created', '--content', 'Body'
  ], { fetch: createFetch(calls, [{ material: { id: 'created-1' } }]) });

  expect(result.status).toBe(0);
  expect(result.output).toMatchObject({ material: { id: 'created-1' } });
  expect(result.output.backup_path).toContain('agent-material-materials-create-new');
  expect(JSON.parse(calls[0].body)).toEqual({ content: 'Body', kind: 'topic', parent_id: null, title: 'Created' });
});

it('moves and reorders materials through read-before-write backup contracts', async () => {
  const moveCalls = [];
  const move = await runAgentCli([
    'materials/move', '--descriptor', descriptor, '--backup-dir', path.join(tempRoot, 'move-backups'),
    '--id', 'topic-1', '--parent-id', 'root', '--expected-updated-at', 't1'
  ], { fetch: createFetch(moveCalls, [{ material: { id: 'topic-1', updated_at: 't1' } }, { material: { id: 'topic-1' } }]) });
  expect(move.status).toBe(0);
  expect(JSON.parse(moveCalls[1].body)).toEqual({ expected_updated_at: 't1', id: 'topic-1', parent_id: null });

  const reorderCalls = [];
  const reorder = await runAgentCli([
    'materials/reorder', '--descriptor', descriptor, '--backup-dir', path.join(tempRoot, 'order-backups'),
    '--material-ids', 'topic-2,topic-1'
  ], { fetch: createFetch(reorderCalls, [{ children: [{ id: 'topic-1' }, { id: 'topic-2' }] }, { reordered_count: 2 }]) });
  expect(reorder.status).toBe(0);
  expect(JSON.parse(reorderCalls[1].body)).toEqual({ material_ids: ['topic-2', 'topic-1'], parent_id: null });
});

it('updates and restores virtual Folders with backups', async () => {
  const updateCalls = [];
  const update = await runAgentCli([
    'virtual-folders/update', '--descriptor', descriptor, '--backup-dir', path.join(tempRoot, 'update-backups'),
    '--id', 'vf-1', '--expected-updated-at', 't1', '--title', 'Renamed'
  ], { fetch: createFetch(updateCalls, [{ id: 'vf-1', title: 'Old' }, { folder_id: 'vf-1', title: 'Renamed' }]) });
  expect(update.status).toBe(0);
  expect(JSON.parse(updateCalls[1].body)).toEqual({ expected_updated_at: 't1', id: 'vf-1', title: 'Renamed' });

  const restoreCalls = [];
  const restore = await runAgentCli([
    'virtual-folders/restore', '--descriptor', descriptor, '--backup-dir', path.join(tempRoot, 'restore-backups'),
    '--id', 'vf-1', '--expected-updated-at', 'deleted-at'
  ], { fetch: createFetch(restoreCalls, [{ folder_id: 'vf-1', restored: true }]) });
  expect(restore.status).toBe(0);
  expect(restoreCalls).toHaveLength(1);
});

function createFetch(calls, payloads) {
  return async (url, init) => {
    calls.push({ body: init.body, url });
    const payload = payloads[calls.length - 1];
    return { json: async () => payload, ok: true };
  };
}
