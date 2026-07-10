import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-invalid-response-'));
});

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

it('distinguishes invalid Agent Control JSON responses from connection failures', async () => {
  const descriptor = await writeDescriptor();
  const result = await runAgentCli(['materials/read', '--descriptor', descriptor, '--id', 'node-1'], {
    fetch: async () => ({
      json: async () => {
        throw new Error('invalid json');
      },
      ok: true
    })
  });

  expect(result).toEqual({ output: { error: 'invalid_response' }, status: 3 });
});

async function writeDescriptor() {
  const descriptorPath = path.join(tempRoot, 'agent-control-session.json');
  await writeFile(descriptorPath, JSON.stringify({
    capabilities: ['materials.read'],
    endpoint: 'http://127.0.0.1:3456',
    token: 'secret-token'
  }));
  return descriptorPath;
}
