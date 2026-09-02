// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { AGENT_CONTROL_ROUTE_REGISTRY } from '../../scripts/agent-control/foliole-agent-routes.mjs';
import {
  AGENT_CONTROL_CAPABILITIES,
  AGENT_CONTROL_PROTOCOL_VERSION,
  type AgentControlCapability,
  type AgentControlSessionDescriptor
} from '../agentControl/agentControlTypes.js';

import { formatOpenAiCompatibleAideSystemPrompt } from './aideProductContext.js';
import { validateAideToolArguments } from './aideToolArguments.js';
import { executeAideTool } from './aideToolExecutor.js';
import { AIDE_TOOL_REGISTRY } from './aideToolRegistry.js';
import { createFolioleDynamicTools } from './codexAppServerDynamicTools.js';
import { createChatCompletionsAideTools } from './openAiCompatibleTools.js';

it('registers every Agent Control product capability exactly once on its protected route', () => {
  const definitions = Object.values(AIDE_TOOL_REGISTRY);
  const routeByCapability = new Map(AGENT_CONTROL_ROUTE_REGISTRY
    .filter((route) => route.access === 'product')
    .map((route) => [route.capability, route.apiPath]));

  expect(definitions).toHaveLength(18);
  expect(new Set(definitions.map((definition) => definition.capability)).size).toBe(18);
  expect(new Set(definitions.map((definition) => definition.capability)))
    .toEqual(new Set(AGENT_CONTROL_CAPABILITIES));
  for (const definition of definitions) {
    expect(`/agent-control/v1/${definition.path}`).toBe(routeByCapability.get(definition.capability));
  }
});

it('projects identical tool identities with provider-compatible schemas', () => {
  const capabilities = ['materials.read', 'materials.create', 'virtualFolders.restore'];
  const [namespace] = createFolioleDynamicTools(capabilities);
  const chatTools = createChatCompletionsAideTools(capabilities);

  expect(chatTools.map((tool) => ({
    description: tool.function.description,
    name: tool.function.name
  }))).toEqual(namespace?.tools.map(({ description, name }) => ({
    description,
    name
  })));
  expect(namespace?.tools.every(({ inputSchema }) => inputSchema.additionalProperties === false)).toBe(true);
  expect(JSON.stringify(chatTools)).not.toContain('"additionalProperties":false');
});

it('enforces conditional Item and Folder creation branches exactly as declared', () => {
  expect(validateAideToolArguments('create_material', {
    content: 'Question', kind: 'item', parent_id: null, reveal: 'Answer'
  })).not.toBeNull();
  expect(validateAideToolArguments('create_material', {
    content: 'Question', kind: 'item', parent_id: null, reveal: 'Answer', title: 'Forbidden'
  })).toBeNull();
  expect(validateAideToolArguments('create_material', {
    kind: 'folder', parent_id: null, title: 'Folder'
  })).not.toBeNull();
  expect(validateAideToolArguments('create_material', {
    kind: 'folder', parent_id: null, reveal: 'Forbidden', title: 'Folder'
  })).toBeNull();
  expect(validateAideToolArguments('create_material', {
    kind: 'topic', parent_id: null
  })).toBeNull();
});

it('enforces patch, uniqueness, primitive, and additional-property constraints', () => {
  expect(validateAideToolArguments('update_material', {
    expected_updated_at: 'now', id: 'topic-1'
  })).toBeNull();
  expect(validateAideToolArguments('update_material', {
    expected_updated_at: 'now', id: 'topic-1', title: ''
  })).not.toBeNull();
  expect(validateAideToolArguments('reorder_materials', {
    material_ids: ['a', 'a'], parent_id: null
  })).toBeNull();
  expect(validateAideToolArguments('search_materials', { limit: 0, query: 'memo' })).toBeNull();
  expect(validateAideToolArguments('read_material', { id: 'topic-1', token: 'nope' })).toBeNull();
});

it('provides shared Aide identity, material, and capability semantics without Codex runtime details', () => {
  const prompt = formatOpenAiCompatibleAideSystemPrompt({
    activeKind: 'topic',
    activeNodeId: 'topic-1',
    activeTitle: 'Memo',
    agentControl: { capabilities: ['materials.read'], state: 'running' },
    schemaVersion: 1,
    scope: 'node'
  });

  expect(prompt).toContain('You are Foliole Aide');
  expect(prompt).toContain('Active Foliole material id: topic-1');
  expect(prompt).toContain('read a Topic, Folder, or Item');
  expect(prompt).toContain('Create an Item only when the user explicitly asks');
  expect(prompt).not.toMatch(/Codex|CLI|skill root|process working directory|workspace path/iu);
});

it('fails closed against capabilities not explicitly exposed to the model', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const result = await executeAideTool(
    { arguments: { id: 'topic-1' }, tool: 'read_material' },
    {
      allowedCapabilities: [],
      descriptor: descriptor(['materials.read']),
      fetcher
    }
  );

  expect(result.success).toBe(false);
  expect(result.contentItems[0]?.text).toContain('capability_disabled');
  expect(fetcher).not.toHaveBeenCalled();
});

it('marks a write as dispatched and surfaces transport ambiguity', async () => {
  const dispatched = vi.fn();
  await expect(executeAideTool(
    {
      arguments: { kind: 'topic', parent_id: null, title: 'Created by Aide' },
      tool: 'create_material'
    },
    {
      allowedCapabilities: ['materials.create'],
      descriptor: descriptor(['materials.create']),
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network failed')),
      onDispatch: dispatched
    }
  )).rejects.toThrow('tool_write_outcome_uncertain');
  expect(dispatched).toHaveBeenCalledWith(true);
});

function descriptor(capabilities: AgentControlCapability[] = []): AgentControlSessionDescriptor {
  return {
    capabilities,
    endpoint: 'http://127.0.0.1:48123',
    pid: 123,
    protocol_version: AGENT_CONTROL_PROTOCOL_VERSION as 1,
    runtime_identity: {
      boot_id: 'boot-1', database_device_id_hash: null, pid: 123,
      started_at: '2026-09-01T12:00:00.000Z'
    },
    started_at: '2026-09-01T12:00:00.000Z',
    token: 'secret'
  };
}
