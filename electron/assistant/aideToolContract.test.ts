// @vitest-environment node

import { expect, it } from 'vitest';

import { AGENT_CONTROL_ROUTE_REGISTRY } from '../../scripts/agent-control/foliole-agent-routes.mjs';
import { AGENT_CONTROL_CAPABILITIES } from '../agentControl/agentControlTypes.js';

import { formatOpenAiCompatibleAideSystemPrompt } from './aideProductContext.js';
import { validateAideToolArguments } from './aideToolArguments.js';
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

it('mechanically projects identical names, descriptions, and schemas to both providers', () => {
  const capabilities = ['materials.read', 'materials.create', 'virtualFolders.restore'];
  const [namespace] = createFolioleDynamicTools(capabilities);
  const chatTools = createChatCompletionsAideTools(capabilities);

  expect(chatTools.map((tool) => ({
    description: tool.function.description,
    inputSchema: tool.function.parameters,
    name: tool.function.name
  }))).toEqual(namespace?.tools.map(({ description, inputSchema, name }) => ({
    description,
    inputSchema,
    name
  })));
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
