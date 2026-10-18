// @vitest-environment node

import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

vi.mock('../sync-group/a5-sync-group-action.mjs', () => ({
  runMacosA5SyncGroupMaintenance: vi.fn()
}));
vi.mock('node:timers/promises', async importOriginal => ({
  ...await importOriginal(), setTimeout: vi.fn(async () => {})
}));

import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';
import { captureA5SyncRun } from './a5-sync-event-proof.mjs';

import { selectProjectedRunById } from '../acceptance/t152-two-device-run-proof.mjs';

it('waits for a completed run after restart instead of accepting an older success', async () => {
  const event = (run_id, occurred_at, status) => ({ run_id, occurred_at, status,
    result: status === 'completed' ? 'completed' : 'partial',
    device_identity_key: 'device-a5', trigger_reason: 'automatic' });
  const old = event('old-success', '2026-10-18T02:02:48.000Z', 'completed');
  const busy = event('restart-busy', '2026-10-18T02:02:57.000Z', 'skipped');
  const fresh = event('restart-success', '2026-10-18T02:04:00.000Z', 'completed');
  const manifest = events => JSON.stringify({ receipt: {
    application_id: 'com.campfirium.foliole.android.acceptance', events
  } });
  vi.mocked(runMacosA5SyncGroupMaintenance).mockResolvedValue({ manifestPath: '/projection.json' });
  const read = vi.spyOn(fs, 'readFileSync')
    .mockReturnValueOnce(manifest([busy, old]))
    .mockReturnValueOnce(manifest([fresh, busy, old]));
  try {
    const result = await captureA5SyncRun({ args: {} }, 'automatic', [], '2026-10-18T02:02:50.000Z');
    expect(result.run.runId).toBe('restart-success');
    expect(read).toHaveBeenCalledTimes(2);
  } finally { read.mockRestore(); }
});

it('reads runs only through the acceptance projection action', () => {
  const source = fs.readFileSync('scripts/android/a5-sync-event-proof.mjs', 'utf8');
  expect(source).toContain("action: 'read-sync-events'");
  expect(source).toContain('projectedEvents(receipt, ACCEPTANCE_APP_ID)');
  expect(source).toContain('selectProjectedRun');
  expect(source).toContain('const deadline = Date.now() + 2 * 60_000');
  expect(source).toContain('await delay(30_000)');
  expect(source).not.toMatch(/SQLite|database|adb.*pull|run_id.*=/u);
});

it('binds a clicked action to its actual projected owner run', () => {
  const run = selectProjectedRunById([{
    device_identity_key: 'device-a5', occurred_at: '2026-09-09T03:53:51.396Z',
    result: 'completed', run_id: 'joined-automatic', status: 'completed',
    trigger_reason: 'automatic'
  }], 'joined-automatic');
  expect(run).toMatchObject({ runId: 'joined-automatic', triggerReason: 'automatic' });
});
