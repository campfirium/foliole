import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-vf-backup-'));
});

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

async function descriptorPath(capabilities) {
  const filePath = path.join(tempRoot, 'agent-control-session.json');
  await writeFile(filePath, JSON.stringify({
    capabilities,
    endpoint: 'http://127.0.0.1:3456',
    protocol_version: 1,
    token: 'secret-token'
  }));
  return filePath;
}

function response(payload, ok = true) {
  return { json: async () => payload, ok };
}

describe('foliole agent cli virtual folder backups', () => {
  it('backs up the previous virtual folder before item mutations', async () => {
    const descriptor = await descriptorPath(['virtualFolders.read', 'virtualFolders.addItems']);
    const backupDir = path.join(tempRoot, 'backups');
    const calls = [];
    const result = await runAgentCli([
      'virtual-folders/add-items',
      '--descriptor', descriptor,
      '--backup-dir', backupDir,
      '--folder-id', 'folder-1',
      '--material-ids', 'node-a,node-b'
    ], {
      fetch: async (url, init) => {
        calls.push({ body: init.body, url });
        return calls.length === 1
          ? response({ folder_id: 'folder-1', items: [{ material_id: 'node-old' }], title: 'Queue' })
          : response({ added: ['node-a', 'node-b'], folder_id: 'folder-1' });
      },
      randomId: () => 'vf-run'
    });

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:3456/agent-control/v1/virtual-folders/read',
      'http://127.0.0.1:3456/agent-control/v1/virtual-folders/add-items'
    ]);
    expect(result.status).toBe(0);
    expect(result.output.backup_path).toContain(backupDir);
    const backup = JSON.parse(await readFile(result.output.backup_path, 'utf8'));
    expect(backup).toMatchObject({
      command: 'virtual-folders/add-items',
      previous_virtual_folder: { folder_id: 'folder-1', title: 'Queue' },
      request_patch: { folder_id: 'folder-1', material_ids: ['node-a', 'node-b'] },
      run_id: 'vf-run',
      virtual_folder_id: 'folder-1'
    });
    expect(JSON.stringify(backup)).not.toContain('secret-token');
  });

  it('does not mutate virtual folders when backup read is unavailable or backup write fails', async () => {
    const missingReadDescriptor = await descriptorPath(['virtualFolders.addItems']);
    const missingRead = await runAgentCli([
      'virtual-folders/add-items',
      '--descriptor', missingReadDescriptor,
      '--folder-id', 'folder-1',
      '--material-ids', 'node-a'
    ]);

    const descriptor = await descriptorPath(['virtualFolders.read', 'virtualFolders.reorder']);
    const blockedPath = path.join(tempRoot, 'blocked');
    await writeFile(blockedPath, 'not a directory');
    let calls = 0;
    const writeFailure = await runAgentCli([
      'virtual-folders/reorder',
      '--descriptor', descriptor,
      '--backup-dir', blockedPath,
      '--folder-id', 'folder-1',
      '--material-ids', 'node-b,node-a'
    ], {
      fetch: async () => {
        calls += 1;
        return response({ folder_id: 'folder-1', items: [{ id: 'item-a' }, { id: 'item-b' }] });
      }
    });

    expect(missingRead).toEqual({ output: { error: 'backup_capability_disabled' }, status: 3 });
    expect(writeFailure).toEqual({ output: { error: 'backup_write_failed' }, status: 4 });
    expect(calls).toBe(1);
  });

  it('backs up virtual folder create requests without a previous folder state', async () => {
    const descriptor = await descriptorPath(['virtualFolders.create']);
    const result = await runAgentCli([
      'virtual-folders/create',
      '--descriptor', descriptor,
      '--backup-dir', path.join(tempRoot, 'backups'),
      '--title', 'Research Queue'
    ], {
      fetch: async () => response({ folder_id: 'folder-new', title: 'Research Queue' }),
      randomId: () => 'create-run'
    });

    expect(result.status).toBe(0);
    const backup = JSON.parse(await readFile(result.output.backup_path, 'utf8'));
    expect(backup).toMatchObject({
      command: 'virtual-folders/create',
      previous_virtual_folder: null,
      request_patch: { title: 'Research Queue' },
      run_id: 'create-run',
      virtual_folder_id: 'new'
    });
  });
});
