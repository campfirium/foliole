import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-material-backup-capability-'));
});

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

it('updates a title without fetching or backing up the existing body', async () => {
  const descriptor = path.join(tempRoot, 'agent-control-session.json');
  await writeFile(descriptor, JSON.stringify({
    capabilities: ['materials.update', 'materials.read'],
    endpoint: 'http://127.0.0.1:3456',
    token: 'secret-token'
  }));
  const calls = [];
  const result = await runAgentCli([
    'materials/update', '--descriptor', descriptor,
    '--id', 'node-1', '--expected-updated-at', 'revision', '--title', 'Next title'
  ], {
    env: {},
    fetch: async (url, init) => {
      calls.push([url, JSON.parse(init.body)]);
      return new globalThis.Response(JSON.stringify({
        material: { id: 'node-1', content_truncated: true, title: 'Next title' }
      }));
    }
  });

  expect(result.status).toBe(0);
  expect(result.output).not.toHaveProperty('backup_path');
  expect(calls).toEqual([[
    'http://127.0.0.1:3456/agent-control/v1/materials/update',
    { id: 'node-1', expected_updated_at: 'revision', title: 'Next title' }
  ]]);
});

it('uses the current revision for soft delete even if the body is truncated', async () => {
  const descriptor = path.join(tempRoot, 'agent-control-session.json');
  await writeFile(descriptor, JSON.stringify({
    capabilities: ['materials.deleteSoft', 'materials.read'],
    endpoint: 'http://127.0.0.1:3456',
    token: 'secret-token'
  }));
  const calls = [];
  const result = await runAgentCli([
    'materials/delete-soft', '--descriptor', descriptor, '--id', 'node-1'
  ], {
    env: {},
    fetch: async (url, init) => {
      calls.push([url, JSON.parse(init.body)]);
      const payload = url.endsWith('/read')
        ? { material: { updated_at: 'revision', content_truncated: true } }
        : { deleted: true };
      return new globalThis.Response(JSON.stringify(payload));
    }
  });

  expect(result).toEqual({ output: { deleted: true }, status: 0 });
  expect(calls).toEqual([
    ['http://127.0.0.1:3456/agent-control/v1/materials/read', { id: 'node-1' }],
    ['http://127.0.0.1:3456/agent-control/v1/materials/delete-soft', {
      id: 'node-1', expected_updated_at: 'revision'
    }]
  ]);
});
