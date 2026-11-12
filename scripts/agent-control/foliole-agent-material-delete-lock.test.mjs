import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-delete-lock-'));
});

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

it('uses the material updated_at as the soft delete optimistic lock', async () => {
  const descriptor = await writeDescriptor();
  const calls = [];
  const result = await runAgentCli([
    'materials/delete-soft',
    '--descriptor', descriptor,
    '--id', 'node-1'
  ], {
    fetch: async (url, init) => {
      calls.push({ body: init.body, url });
      return calls.length === 1
        ? response({ material: material() })
        : response({ deleted_at: '2026-07-05T00:02:00.000Z', id: 'node-1' });
    },
  });

  expect(result.status).toBe(0);
  expect(JSON.parse(calls[1].body)).toEqual({
    expected_updated_at: '2026-07-05T00:00:00.000Z',
    id: 'node-1'
  });

});

function material() {
  return {
    content: 'Old body',
    content_truncated: false,
    id: 'node-1',
    title: 'Old title',
    updated_at: '2026-07-05T00:00:00.000Z'
  };
}

function response(payload, ok = true) {
  return { json: async () => payload, ok };
}

async function writeDescriptor() {
  const descriptorPath = path.join(tempRoot, 'agent-control-session.json');
  await writeFile(descriptorPath, JSON.stringify({
    capabilities: ['materials.read', 'materials.deleteSoft'],
    endpoint: 'http://127.0.0.1:3456',
    token: 'secret-token'
  }));
  return descriptorPath;
}
