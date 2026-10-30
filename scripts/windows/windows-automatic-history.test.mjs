// @vitest-environment node
import { expect, it } from 'vitest';

import { readCompletedAutomatic } from './windows-single-principal-sync-group-contract.mjs';

const event = { kind: 'run_finished', trigger_reason: 'automatic', status: 'completed',
  result: 'completed', run_id: 'saved', started_at: '2026-10-30T03:15:21Z',
  occurred_at: '2026-10-30T03:15:22Z' };
const session = activity => ({ loadSyncTriggerResult: async () => ({ status: 'skipped' }),
  invoke: async () => ({ activity }) });

it('reads the completed automatic run despite later skipped and manual activity', async () => {
  const activity = [{ ...event, status: 'skipped' }, { ...event, trigger_reason: 'manual' }, event];
  await expect(readCompletedAutomatic(session(activity))).resolves.toMatchObject({
    reason: 'automatic', status: 'completed', run_id: 'saved'
  });
});

it.each([{ status: 'failed' }, { result: 'waiting' }, { trigger_reason: 'initial' },
  { kind: 'stage_finished' }, { run_id: null }, { started_at: null }, { occurred_at: null }])(
  'rejects incomplete or unrelated activity %j', async patch => {
    await expect(readCompletedAutomatic(session([{ ...event, ...patch }]))).resolves.toBeNull();
  }
);
