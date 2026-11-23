// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { normalizeAideToolPermissionSettings } from '../../lib/core/assistant/aideToolPermissionSettings.js';
import { AGENT_CONTROL_PROTOCOL_VERSION, type AgentControlSessionDescriptor } from '../agentControl/agentControlTypes.js';

import type { AideLocalToolHandler } from './aideLocalReadTools.js';
import { executeAideTool } from './aideToolExecutor.js';
import { createAideToolSession } from './aideToolSession.js';
import { createFolioleDynamicTools } from './codexAppServerDynamicTools.js';
import { createChatCompletionsAideTools } from './openAiCompatibleTools.js';

const descriptor: AgentControlSessionDescriptor = {
  capabilities: ['materials.read', 'materials.search', 'materials.update'],
  endpoint: 'http://127.0.0.1:48123',
  pid: 1,
  protocol_version: AGENT_CONTROL_PROTOCOL_VERSION as 1,
  runtime_identity: { boot_id: 'boot', database_device_id_hash: null, pid: 1, started_at: 'now' },
  started_at: 'now',
  token: 'secret'
};

function session(read: Record<string, boolean> = {}, readBudget = 20_000, write: Record<string, boolean> = {}) {
  return createAideToolSession(normalizeAideToolPermissionSettings({ read, readBudget, write }));
}

function localRead(text: string): Record<string, AideLocalToolHandler> {
  return { read_material: vi.fn(async () => ({ ok: true, payload: { material: { content: text } } })) };
}

function readText(result: Awaited<ReturnType<typeof executeAideTool>>) {
  return JSON.parse(result.contentItems[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('Aide read switches', () => {
  it('does not offer a tool that is switched off in either model channel', () => {
    const { disabledTools } = session({ continueReading: false, searchLibrary: false });
    const [namespace] = createFolioleDynamicTools(descriptor.capabilities, disabledTools);
    const codexNames = namespace?.tools.map((tool) => tool.name) ?? [];
    const byokNames = createChatCompletionsAideTools(descriptor.capabilities, disabledTools).map((tool) => tool.function.name);
    for (const names of [codexNames, byokNames]) {
      expect(names).not.toContain('read_material');
      expect(names).not.toContain('search_materials');
      expect(names).toEqual(expect.arrayContaining(['search_in_material', 'trace_source', 'read_pdf_page', 'update_material']));
    }
  });

  it('rejects a call to a switched-off tool even when the model still knows it', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const localTools = localRead('body');
    const toolSession = session({ continueReading: false, searchLibrary: false });
    const local = await executeAideTool({ arguments: { id: 'topic-1' }, tool: 'read_material' }, { descriptor, localTools, session: toolSession });
    const remote = await executeAideTool({ arguments: { query: 'memo' }, tool: 'search_materials' }, { descriptor, fetcher, session: toolSession });
    expect(readText(local)).toEqual({ error: 'tool_disabled' });
    expect(readText(remote)).toEqual({ error: 'tool_disabled' });
    expect(localTools.read_material).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('passes validated arguments to the local reader', async () => {
    const localTools = localRead('body');
    const result = await executeAideTool(
      { arguments: { id: 'topic-1', length: 500, offset: 1000 }, tool: 'read_material' },
      { descriptor, localTools, session: session() }
    );
    expect(result.success).toBe(true);
    expect(localTools.read_material).toHaveBeenCalledWith({ id: 'topic-1', length: 500, offset: 1000 });
    const invalid = await executeAideTool({ arguments: { id: 'topic-1', offset: -1 }, tool: 'read_material' }, { descriptor, localTools });
    expect(readText(invalid)).toEqual({ error: 'invalid_arguments' });
  });
});

describe('Aide per-reply read limit', () => {
  it('counts every read tool and returns the limit message once the total would pass it', async () => {
    const toolSession = session({}, 1_000);
    const localTools = localRead('x'.repeat(2_400)); // about 600 tokens per read
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: ['y'.repeat(800)] }), { status: 200 }));
    const first = await executeAideTool({ arguments: { id: 'a' }, tool: 'read_material' }, { descriptor, localTools, session: toolSession });
    const search = await executeAideTool({ arguments: { query: 'q' }, tool: 'search_materials' }, { descriptor, fetcher, session: toolSession });
    const over = await executeAideTool({ arguments: { id: 'b' }, tool: 'read_material' }, { descriptor, localTools, session: toolSession });
    expect(first.success && search.success).toBe(true);
    expect(over.success).toBe(false);
    expect(readText(over)).toMatchObject({ error: 'read_limit_reached', remaining_tokens: 1_000 - toolSession.readUsed });
    expect(toolSession.readUsed).toBeLessThanOrEqual(1_000);
  });

  it('stops reading entirely once the limit is used up, but leaves writes alone', async () => {
    const toolSession = session({}, 1_000);
    toolSession.readUsed = 1_000;
    const localTools = localRead('tiny');
    const fetcher = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const read = await executeAideTool({ arguments: { id: 'a' }, tool: 'read_material' }, { descriptor, localTools, session: toolSession });
    const write = await executeAideTool(
      { arguments: { content: 'new', expected_updated_at: 'now', id: 'a' }, tool: 'update_material' },
      { descriptor, fetcher, session: toolSession }
    );
    expect(readText(read)).toMatchObject({ error: 'read_limit_reached', remaining_tokens: 0 });
    expect(localTools.read_material).not.toHaveBeenCalled();
    expect(write.success).toBe(true);
  });

  it('starts every reply with a fresh count', () => {
    const settings = normalizeAideToolPermissionSettings({ readBudget: 3_000 });
    const used = createAideToolSession(settings);
    used.readUsed = 3_000;
    expect(createAideToolSession(settings)).toMatchObject({ readBudget: 3_000, readUsed: 0 });
  });
});

describe('Aide modify switches', () => {
  it('does not offer the switched-off modify tools and rejects calls to them', async () => {
    const capabilities = ['materials.read', 'materials.update', 'materials.move', 'materials.reorder', 'virtualFolders.create'];
    const toolSession = session({}, 20_000, { editContent: false, manageIndexes: false });
    const [namespace] = createFolioleDynamicTools(capabilities, toolSession.disabledTools);
    const names = namespace?.tools.map((tool) => tool.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(['move_material', 'reorder_materials']));
    expect(names).not.toContain('update_material');
    expect(names).not.toContain('create_virtual_folder');
    const fetcher = vi.fn<typeof fetch>();
    const onDispatch = vi.fn();
    const result = await executeAideTool(
      { arguments: { content: 'new', expected_updated_at: 'now', id: 'a' }, tool: 'update_material' },
      { descriptor, fetcher, onDispatch, session: toolSession }
    );
    expect(readText(result)).toEqual({ error: 'tool_disabled' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it('marks a local Dive change as a write so the reply knows something changed', async () => {
    const onDispatch = vi.fn();
    const rename = vi.fn(async () => ({ ok: true, payload: { dive: { id: 'd' } } }));
    const result = await executeAideTool(
      { arguments: { id: 'd', title: 'New' }, tool: 'rename_dive' },
      { descriptor: { ...descriptor, capabilities: ['virtualFolders.update'] }, localTools: { rename_dive: rename }, onDispatch, session: session() }
    );
    expect(result.success).toBe(true);
    expect(onDispatch).toHaveBeenCalledWith(true);
  });
});
