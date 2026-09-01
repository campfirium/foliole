// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  createClientPairTopic, distinctClientPairDeviceIds, updateClientPairTopic
} from './client-pair-sync-content-action.mjs';

it('reads the product device identity field for both participants', () => {
  expect(distinctClientPairDeviceIds([
    { device_identity_key: 'mac-device' }, { device_identity_key: 'windows-device' }
  ])).toEqual(['mac-device', 'windows-device']);
  expect(() => distinctClientPairDeviceIds([
    { device_identity_key: 'same-device' }, { device_identity_key: 'same-device' }
  ])).toThrow('two distinct device identities');
});

it('creates and updates the same exact client-pair entity', async () => {
  const nodesById = {};
  const invoke = vi.fn(async (command, args) => {
    if (command === 'load_workspace_list_snapshot') {
      return { nodeOrder: Object.keys(nodesById), nodesById: Object.fromEntries(
        Object.entries(nodesById).map(([id, node]) => [id, { ...node, id, nodeId: undefined }])
      ) };
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
