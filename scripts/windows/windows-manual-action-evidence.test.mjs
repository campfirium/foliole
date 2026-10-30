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

it('lets the public manual action recover routes despite an empty transient role snapshot', async () => {
  let invoked = false;
  const session = { loadSyncRole: async () => ({ hasUpstream: false, hasDownstream: false }),
    invoke: async command => {
      if (command === 'sync_companion_now') { invoked = true; return { sync_group: {} }; }
      return { activity: invoked ? [{ kind: 'run_finished', trigger_reason: 'manual',
        status: 'completed', result: 'completed', run_id: 'recovered', started_at: 'start', occurred_at: 'finish' }] : [] };
    } };
  await expect(runAvailableManualSync(session)).resolves.toMatchObject({ run_id: 'recovered', status: 'completed' });
  expect(invoked).toBe(true);
});

it('records no completion only after the public action reports no peer', async () => {
  let invoked = false;
  const session = { loadSyncRole: async () => ({ hasUpstream: true }), invoke: async command => {
    if (command === 'load_desktop_sync_diagnostics') return { activity: [] };
    invoked = true;
    throw new Error('sync_group_peer_unavailable');
  } };
  await expect(runAvailableManualSync(session)).resolves.toBeNull();
  expect(invoked).toBe(true);
});

it('propagates actual synchronization errors', async () => {
  await expect(runAvailableManualSync({ loadSyncRole: async () => ({ hasUpstream: true }), invoke: async command => {
    if (command === 'load_desktop_sync_diagnostics') return { activity: [] };
    throw new Error('sync_pack_corrupt');
  } })).rejects.toThrow('sync_pack_corrupt');
});
