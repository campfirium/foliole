import fs from 'node:fs';

import { expect, it } from 'vitest';

import { selectProjectedRunById } from '../acceptance/t152-two-device-run-proof.mjs';

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
