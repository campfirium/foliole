/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { EXPECTED_SYNC_GROUP, runMacosSyncGroupLeave } from './macos-sync-group-leave-action.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('leaves only the fixed three-member group through the product command', async () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp/artifacts/macos-leave-test-'));
  roots.push(root);
  const close = vi.fn();
  const leave = vi.fn(async () => ({ paired_devices: [], sync_group: null }));
  const load = vi.fn(async () => ({
    sync_group: {
      group_id: EXPECTED_SYNC_GROUP.groupId,
      members: ['Mac', 'A5', 'Windows'].map((host_name, index) => ({
        authorization_id: `authorization-${index}`, host_name, state: 'active'
      })),
      timeline_id: EXPECTED_SYNC_GROUP.timelineId
    }
  }));

  const result = await runMacosSyncGroupLeave({
    evidenceRoot: root, openSession: async () => ({ close, leave, load }), repoRoot: process.cwd()
  });

  expect(leave).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'))).toMatchObject({
    groupId: EXPECTED_SYNC_GROUP.groupId, resultStatus: 'success'
  });
});

it('refuses a different group before invoking Leave', async () => {
  const leave = vi.fn();
  const close = vi.fn();
  await expect(runMacosSyncGroupLeave({
    evidenceRoot: '/unused', openSession: async () => ({
      close, leave, load: async () => ({ sync_group: { group_id: 'other', members: [], timeline_id: 'other' } })
    })
  })).rejects.toThrow('does not match the fixed T121-3 acceptance group');
  expect(leave).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
