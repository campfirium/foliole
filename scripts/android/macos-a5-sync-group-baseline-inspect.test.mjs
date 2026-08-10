// @vitest-environment node
/* global process */

import { expect, it } from 'vitest';

import { inspectMacosA5SyncGroupBaseline } from './macos-a5-sync-group-baseline-inspect.mjs';

it('requires restarted A and B to share one timeline with exactly two active members', async () => {
  const group = { group_id: 'group-1', local_member_state: 'active',
    members: [{ state: 'active' }, { state: 'active' }], timeline_id: 'timeline-1' };
  const collectSnapshot = async () => ({ database: { counts: { nodes: 2 }, inspection: {
    activeSyncGroupMemberCount: 2, syncGroupId: 'group-1', syncGroupTimelineId: 'timeline-1'
  }, integrity: 'ok' } });
  const result = await inspectMacosA5SyncGroupBaseline({ collectSnapshot,
    openSession: async () => ({ close: async () => undefined, load: async () => ({ sync_group: group }) }),
    repoRoot: process.cwd(), runAdb: async () => undefined, wait: async () => undefined });
  expect(result.evidence).toMatchObject({ identity: { groupId: 'group-1', timelineId: 'timeline-1' },
    resultStatus: 'success' });
});
