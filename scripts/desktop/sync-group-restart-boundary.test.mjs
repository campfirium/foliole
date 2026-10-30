// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { waitForMacosAutomaticRun } from '../android/macos-sync-group-desktop-session.mjs';
import { completedAutomatic } from '../windows/windows-single-principal-sync-group-contract.mjs';
import { waitForAutomaticSync } from '../windows/windows-single-principal-sync-group-action.mjs';
import { waitForSyncGroupAutomaticRun } from './sync-group-controller-read.mjs';

const boundary = '2026-10-30T04:00:00.000Z';
const old = { reason: 'automatic', status: 'completed', run_id: 'conflict-before-restart',
  started_at: '2026-10-30T03:59:00.000Z' };
const fresh = { ...old, run_id: 'after-restart', started_at: boundary };

it('ignores a different completed run that still belongs to the stopped process', async () => {
  const read = vi.fn().mockResolvedValueOnce(old).mockResolvedValueOnce({ ...old, started_at: undefined })
    .mockResolvedValue(fresh);
  await expect(waitForSyncGroupAutomaticRun(read, 'initial', { startedAfter: boundary,
    wait: async () => {}, timeoutMs: 1000 })).resolves.toEqual(fresh);
  expect(read).toHaveBeenCalledTimes(3);
});

it('applies the process-start boundary through the Mac adapter', async () => {
  const read = vi.fn().mockResolvedValueOnce(old).mockResolvedValue(fresh);
  await expect(waitForMacosAutomaticRun({ loadSyncTriggerResult: read }, 'initial', {
    startedAfter: boundary, timeoutMs: 1000
  })).resolves.toEqual(fresh);
});

it('applies the process-start boundary through the Windows adapter', async () => {
  const app = { evaluate: vi.fn().mockResolvedValueOnce(old).mockResolvedValue(fresh) };
  await expect(waitForAutomaticSync({ app }, 'initial', { startedAfter: boundary, timeoutMs: 1000 }))
    .resolves.toEqual(fresh);
});

it('rejects old or undated passive observations after a process restart', () => {
  expect(completedAutomatic(old, 'initial', boundary)).toBeNull();
  expect(completedAutomatic({ ...fresh, started_at: undefined }, 'initial', boundary)).toBeNull();
  expect(completedAutomatic(fresh, 'initial', boundary)).toEqual(fresh);
});
