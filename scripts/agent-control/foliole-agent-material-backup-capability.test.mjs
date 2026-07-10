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

it('does not run material write routes when backup read capability is missing', async () => {
  const descriptor = path.join(tempRoot, 'agent-control-session.json');
  await writeFile(descriptor, JSON.stringify({
    capabilities: ['materials.update', 'materials.deleteSoft'],
    endpoint: 'http://127.0.0.1:3456',
    protocol_version: 1,
    token: 'secret-token'
  }));
  const calls = [];

  const result = await runAgentCli([
    'materials/update',
    '--descriptor', descriptor,
    '--id', 'node-1',
    '--expected-updated-at', '2026-07-05T00:00:00.000Z',
    '--title', 'Next title'
  ], {
    fetch: async (url) => {
      calls.push(url);
      throw new Error('fetch should not run');
    }
  });

  expect(result).toEqual({ output: { error: 'backup_capability_disabled' }, status: 3 });
  expect(calls).toEqual([]);
});
