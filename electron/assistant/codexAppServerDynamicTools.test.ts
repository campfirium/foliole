// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { AGENT_CONTROL_CAPABILITIES } from '../agentControl/agentControlTypes.js';
import type { AgentControlSessionDescriptor } from '../agentControl/agentControlTypes.js';

import {
  createFolioleDynamicTools,
  executeFolioleDynamicTool
} from './codexAppServerDynamicTools.js';

const descriptor: AgentControlSessionDescriptor = {
  capabilities: ['materials.read', 'materials.search', 'materials.update'],
  endpoint: 'http://127.0.0.1:5000',
  pid: 1,
  protocol_version: 1,
  runtime_identity: {
    boot_id: 'boot',
    database_device_id_hash: null,
    pid: 1,
    started_at: '2026-07-17T00:00:00.000Z'
  },
  started_at: '2026-07-17T00:00:00.000Z',
  token: 'secret-token'
};

it('registers every enabled read and write tool', () => {
  const [namespace] = createFolioleDynamicTools([
    'materials.read',
    'materials.search',
    'materials.update'
  ]);

  expect(namespace).toMatchObject({ name: 'foliole', type: 'namespace' });
  expect(namespace?.tools.map((tool) => tool.name)).toEqual([
    'read_material',
    'search_materials',
    'update_material'
  ]);
});

it('keeps one dynamic tool for every product capability', () => {
  const [namespace] = createFolioleDynamicTools(AGENT_CONTROL_CAPABILITIES);

  expect(namespace?.tools).toHaveLength(AGENT_CONTROL_CAPABILITIES.length);
});

it('describes conditional question-answer Item creation without enabling automatic saves', () => {
  const [namespace] = createFolioleDynamicTools(['materials.create']);
  const createTool = namespace?.tools.find((tool) => tool.name === 'create_material');

  expect(createTool).toMatchObject({
    description: expect.stringContaining('only when the user explicitly asks'),
    inputSchema: expect.objectContaining({ oneOf: expect.any(Array) })
  });
  expect(JSON.stringify(createTool?.inputSchema)).toContain('reveal');
  expect(JSON.stringify(createTool?.inputSchema)).toContain('item');
});

it('calls the protected write route with optimistic concurrency fields', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ material: { id: 'topic-1' } }), {
    headers: { 'content-type': 'application/json' },
    status: 200
  }));

  const result = await executeFolioleDynamicTool({
    arguments: {
      content: 'Updated memo',
      expected_updated_at: '2026-07-17T00:00:00.000Z',
      id: 'topic-1'
    },
    tool: 'update_material'
  }, { descriptor, fetcher });

  expect(fetcher).toHaveBeenCalledWith(
    'http://127.0.0.1:5000/agent-control/v1/materials/update',
    expect.objectContaining({
      body: JSON.stringify({
        content: 'Updated memo',
        expected_updated_at: '2026-07-17T00:00:00.000Z',
        id: 'topic-1'
      })
    })
  );
  expect(result.success).toBe(true);
});

it('calls the existing protected Agent Control route without exposing its token', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ material: { id: 'topic-1' } }), {
    headers: { 'content-type': 'application/json' },
    status: 200
  }));

  const result = await executeFolioleDynamicTool({
    arguments: { id: 'topic-1' },
    tool: 'read_material'
  }, { descriptor, fetcher });

  expect(fetcher).toHaveBeenCalledWith(
    'http://127.0.0.1:5000/agent-control/v1/materials/read',
    expect.objectContaining({
      body: JSON.stringify({ id: 'topic-1' }),
      headers: expect.objectContaining({
        authorization: 'Bearer secret-token',
        'x-foliole-agent-id': 'foliole-aide'
      }),
      method: 'POST'
    })
  );
  expect(result).toEqual({
    contentItems: [{ text: JSON.stringify({ material: { id: 'topic-1' } }), type: 'inputText' }],
    success: true
  });
  expect(JSON.stringify(result)).not.toContain('secret-token');
});

it('fails closed for invalid arguments and disabled capabilities', async () => {
  const fetcher = vi.fn();
  const invalid = await executeFolioleDynamicTool({
    arguments: { id: '', unexpected: true },
    tool: 'read_material'
  }, { descriptor, fetcher });
  const disabled = await executeFolioleDynamicTool({
    arguments: {},
    tool: 'list_virtual_folders'
  }, { descriptor, fetcher });
  const missingPatch = await executeFolioleDynamicTool({
    arguments: { expected_updated_at: 'now', id: 'topic-1' },
    tool: 'update_material'
  }, { descriptor, fetcher });

  expect(invalid).toMatchObject({ success: false });
  expect(disabled).toMatchObject({ success: false });
  expect(missingPatch).toMatchObject({ success: false });
  expect(fetcher).not.toHaveBeenCalled();
});
