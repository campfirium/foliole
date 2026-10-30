// @vitest-environment node
import { expect, it } from 'vitest';

import { runAvailableManualSync } from './windows-single-principal-sync-group-contract.mjs';

it.each(['manual', 'automatic'])('reads new %s completion after the public action returns an overview', async reason => {
  const activity = [{ kind: 'run_finished', trigger_reason: 'manual', status: 'completed',
    result: 'completed', run_id: 'old', started_at: 'before', occurred_at: 'before' }];
  activity.push({ ...activity[0], kind: 'run_started', status: 'started', run_id: 'new' });
  const session = { loadSyncRole: async () => ({ hasUpstream: true }), invoke: async command => {
    if (command === 'load_desktop_sync_diagnostics') return { activity: [...activity] };
    expect(command).toBe('sync_companion_now');
    activity.unshift({ ...activity[0], trigger_reason: reason, run_id: 'new', started_at: 'start', occurred_at: 'finish' });
    return { sync_group: { group_id: 'group' } };
  } };
  await expect(runAvailableManualSync(session)).resolves.toMatchObject({ reason, status: 'completed', run_id: 'new' });
});

it('rejects a successful overview response without any new completed synchronization', async () => {
  const session = { loadSyncRole: async () => ({ hasUpstream: true }), invoke: async command =>
    command === 'load_desktop_sync_diagnostics' ? { activity: [] } : { sync_group: { group_id: 'group' } } };
  await expect(runAvailableManualSync(session)).rejects.toThrow('No new completed run');
});
