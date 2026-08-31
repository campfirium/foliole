// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  createClientPairTopic, updateClientPairTopic
} from './client-pair-sync-content-action.mjs';

it('creates and updates the same exact client-pair entity', async () => {
  const nodesById = {};
  const invoke = vi.fn(async (command, args) => {
    if (command === 'load_workspace_list_snapshot') {
      return { nodeOrder: Object.keys(nodesById), nodesById };
    }
    if (command === 'create_topic') {
      nodesById[args.nodeId] = args;
      return { createdNodeIds: [args.nodeId] };
    }
    nodesById[args.nodeId] = args;
    return { updatedNodeIds: [args.nodeId] };
  });
  const session = { invoke };
  const created = await createClientPairTopic({ label: 'mac',
    now: () => new Date('2026-08-31T02:00:00.000Z'), session });
  const updated = await updateClientPairTopic({ expected: created,
    now: () => new Date('2026-08-31T02:01:00.000Z'), session });

  expect(updated).toMatchObject({ nodeId: created.nodeId, title: created.title,
    updatedAt: '2026-08-31T02:01:00.000Z' });
  expect(updated.content).toContain(created.content);
});
