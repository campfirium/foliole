import { expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { runDevReimportSelectedTopic } from './devReimportSelectedTopic';

it('reimports the selected keep-import topic without deleting it first', async () => {
  const runtimeInvoke = vi.fn(async () => ({
    detail: null,
    node_id: 'topic-1',
    reimported_at: '2026-05-13T00:00:02.000Z',
    status: 'reimported' as const
  }));

  const result = await runDevReimportSelectedTopic({
    nodeId: 'topic-1',
    runtimeInvoke
  });

  expect(result).toEqual({ status: 'reimported', nodeId: 'topic-1' });
  expect(runtimeInvoke).toHaveBeenCalledTimes(1);
  expect(runtimeInvoke).toHaveBeenCalledWith(NATIVE_COMMANDS.devReimportCurrentTopicSource, {
    node_id: 'topic-1'
  });
  expect(runtimeInvoke).not.toHaveBeenCalledWith(NATIVE_COMMANDS.softDeleteNodes, expect.anything());
  expect(runtimeInvoke).not.toHaveBeenCalledWith(NATIVE_COMMANDS.deleteNodesPermanently, expect.anything());
});

it('returns native unavailability without deleting the selected topic', async () => {
  const runtimeInvoke = vi.fn(async () => ({
    detail: 'Selected topic is not backed by an active keep import source.',
    node_id: null,
    reimported_at: '2026-05-13T00:00:02.000Z',
    status: 'unavailable' as const
  }));

  const result = await runDevReimportSelectedTopic({
    nodeId: 'topic-1',
    runtimeInvoke
  });

  expect(result).toEqual({
    detail: 'Selected topic is not backed by an active keep import source.',
    status: 'unavailable'
  });
  expect(runtimeInvoke).toHaveBeenCalledWith(NATIVE_COMMANDS.devReimportCurrentTopicSource, {
    node_id: 'topic-1'
  });
});
