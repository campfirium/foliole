// @vitest-environment node

import { expect, it, vi } from 'vitest';

import type { NativeAssistantWriteChange } from '../../lib/platform/nativeAssistantContract.js';
import { AGENT_CONTROL_PROTOCOL_VERSION, type AgentControlSessionDescriptor } from '../agentControl/agentControlTypes.js';

import { executeAideTool } from './aideToolExecutor.js';
import { createAideToolSession } from './aideToolSession.js';
import { describeAideWriteRequests } from './aideWriteChangeDescriptions.js';

vi.mock('../database/connection.js', async (importOriginal) => ({
  ...await importOriginal<object>(),
  openDatabaseConnection: () => ({
    sqlite: { prepare: () => ({ get: readMaterial }) }
  })
}));

function readMaterial(id: string) {
  return id === 'item' ? { kind: 'item', title: 'Old question' } : { kind: 'topic', title: 'Old title' };
}

const descriptor: AgentControlSessionDescriptor = {
  capabilities: ['materials.update'],
  endpoint: 'http://127.0.0.1:1',
  pid: 1,
  protocol_version: AGENT_CONTROL_PROTOCOL_VERSION,
  runtime_identity: { boot_id: 'boot', database_device_id_hash: null, pid: 1, started_at: 'now' },
  started_at: 'now',
  token: 'test'
};

async function approveMaterialUpdate(args: Record<string, string>) {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{}'));
  let changes: NativeAssistantWriteChange[] = [];
  const session = createAideToolSession(undefined, async (requests) => {
    expect(fetcher).not.toHaveBeenCalled();
    changes = await describeAideWriteRequests(requests);
    return true;
  });
  const result = await executeAideTool({
    arguments: args,
    tool: 'update_material'
  }, { descriptor, fetcher, session });
  expect(result.success).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(args);
  return changes;
}

it('discloses both sides of the same Item update before sending it', async () => {
  expect(await approveMaterialUpdate({
    content: 'New question', expected_updated_at: 'now', id: 'item', reveal: 'New answer'
  })).toEqual([{
    details: [{ field: 'question', value: 'New question' }, { field: 'answer', value: 'New answer' }],
    target: 'Old question',
    tool: 'update_material'
  }]);
});

it('discloses an explicit body clear alongside a new title', async () => {
  expect(await approveMaterialUpdate({
    content: '', expected_updated_at: 'now', id: 'topic', title: 'New title'
  })).toEqual([{
    details: [{ field: 'title', value: 'New title' }, { field: 'content', value: '' }],
    target: 'Old title',
    tool: 'update_material'
  }]);
});

it('labels a question-only change on an Item and omits absent fields', async () => {
  expect(await approveMaterialUpdate({
    content: 'New question', expected_updated_at: 'now', id: 'item'
  })).toEqual([{
    details: [{ field: 'question', value: 'New question' }],
    target: 'Old question',
    tool: 'update_material'
  }]);
});
