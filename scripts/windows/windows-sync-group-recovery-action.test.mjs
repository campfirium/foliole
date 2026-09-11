import { expect, it } from 'vitest';

import { waitForJoinedGroup } from './windows-sync-group-join-completion.mjs';

const joined = { sync_group: { devices: [{ device_identity_key: 'windows', state: 'active' }],
  group_id: 'group-1', local_device_identity_key: 'windows' } };

it('completes an approved pending join through the product command', async () => {
  const commands = [];
  let attempts = 0;
  const page = { evaluate: async (_fn, { command }) => {
    commands.push(command);
    if (command === 'load_sync_group_overview') return { join_request: { status: 'pending' } };
    attempts += 1;
    if (attempts === 1) throw new Error('sync_group_join_request_pending');
    return joined;
  } };
  await expect(waitForJoinedGroup(page, 'group-1', 1_000, async () => {})).resolves.toBe(joined);
  expect(commands).toEqual(['load_sync_group_overview', 'complete_sync_group_join',
    'load_sync_group_overview', 'complete_sync_group_join']);
});

it('fails immediately when join completion reports a non-pending error', async () => {
  const page = { evaluate: async (_fn, { command }) => {
    if (command === 'load_sync_group_overview') return { join_request: { status: 'pending' } };
    throw new Error('sync_group_identity_mismatch');
  } };
  await expect(waitForJoinedGroup(page, 'group-1', 1_000, async () => {}))
    .rejects.toThrow('sync_group_identity_mismatch');
});
