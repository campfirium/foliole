import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-item-cli-'));
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

function response(payload) {
  return { json: async () => payload, ok: true };
}

function item(overrides = {}) {
  return {
    content: 'Question?', content_truncated: false, id: 'node-1', kind: 'item',
    reveal: 'Original answer', reveal_truncated: false, title: 'Question?',
    updated_at: '2026-07-05T00:00:00.000Z', ...overrides
  };
}

it('creates a question-answer Item through the existing materials route', async () => {
  const descriptor = await descriptorPath(['materials.create']);
  const calls = [];
  const result = await runAgentCli([
    'materials/create', '--descriptor', descriptor,
    '--kind', 'item', '--content', 'Question?', '--reveal', 'Answer.', '--parent-id', 'root'
  ], {
    fetch: async (url, init) => {
      calls.push({ body: JSON.parse(init.body), url });
      return response({ material: item({ reveal: 'Answer.' }) });
    },
  });

  expect(result.status).toBe(0);
  expect(calls).toEqual([{
    body: { content: 'Question?', kind: 'item', parent_id: null, reveal: 'Answer.' },
    url: 'http://127.0.0.1:3456/agent-control/v1/materials/create'
  }]);
  expect(await runAgentCli([
    'materials/create', '--descriptor', descriptor, '--kind', 'item', '--content', 'Question?'
  ])).toEqual({ output: { error: 'missing_reveal' }, status: 2 });
});

it('updates the Item answer with the supplied revision', async () => {
  const descriptor = await descriptorPath(['materials.update']);
  const previous = item();
  const result = await runAgentCli([
    'materials/update', '--descriptor', descriptor,
    '--id', 'node-1', '--expected-updated-at', previous.updated_at, '--reveal', 'New answer'
  ], {
    fetch: async (url, init) => {
      expect(url).toMatch(/\/materials\/update$/u);
      expect(JSON.parse(init.body)).toEqual({
        id: 'node-1', expected_updated_at: previous.updated_at, reveal: 'New answer'
      });
      return response({ material: item({ reveal: 'New answer' }) });
    }
  });

  expect(result.output.material.reveal).toBe('New answer');
  expect(result.status).toBe(0);
});
