import { expect, it, vi } from 'vitest';

import { runAOfflineAdmissionPrelude } from './multi-device-sync-fact-preparation.mjs';

it('creates on A, proves B received the fact, takes A offline, then starts C', async () => {
  const events = [];
  const milestones = [];
  const close = vi.fn(async () => { events.push('a-offline'); });
  const result = await runAOfflineAdmissionPrelude({
    createFact: async () => { events.push('a-fact-created'); return { factId: 'fact-a' }; },
    openSession: async () => ({ close, enable: async () => {
      events.push('a-listener-ready');
      return { server_status: { state: 'running' }, sync_enabled: true };
    } }),
    reportProgress: (milestone) => milestones.push(milestone),
    runApproval: async ({ onProviderStopped, onReady }) => {
      events.push('b-provider-stopped'); await onProviderStopped();
      events.push('b-started'); await onReady(); events.push('c-approved'); return 'approval';
    },
    startWindows: async () => { events.push('c-started'); return 'windows'; },
    waitForFact: async (factId) => { events.push(`b-received-${factId}`); }
  });
  expect(events).toEqual([
    'a-listener-ready', 'a-fact-created', 'b-provider-stopped', 'b-started',
    'b-received-fact-a', 'a-offline', 'c-started', 'c-approved'
  ]);
  expect(close).toHaveBeenCalledTimes(1);
  expect(milestones).toEqual([
    'a-listener-ready', 'a-fact-created', 'b-provider-stopped', 'b-anchor-sync-ready',
    'b-fact-received', 'a-offline', 'c-join-started', 'b-approval-completed'
  ]);
  expect(result).toMatchObject({ approval: 'approval', windows: 'windows' });
});

it('waits for the v5 listener before creating the offline admission fact', async () => {
  const order = [];
  const session = { close: vi.fn(async () => {}), enable: vi.fn(async () => {
    order.push('enable'); return { server_status: { state: 'starting' } };
  }) };
  await runAOfflineAdmissionPrelude({
    createFact: async () => { order.push('fact'); return { factId: 'fact-a' }; },
    openSession: async () => session,
    runApproval: async ({ onProviderStopped, onReady }) => {
      await onProviderStopped(); await onReady(); return 'approved';
    }, startWindows: async () => 'windows', waitForFact: async () => {},
    waitForListener: async () => {
      order.push('anchor-ready');
      return { server_status: { state: 'running' }, sync_enabled: true };
    } });
  expect(order.slice(0, 3)).toEqual(['enable', 'anchor-ready', 'fact']);
});

it('closes the desktop session when B never receives the A fact', async () => {
  const close = vi.fn(async () => undefined);
  await expect(runAOfflineAdmissionPrelude({
    createFact: async () => ({ factId: 'fact-a' }),
    openSession: async () => ({ close, enable: async () => ({
      server_status: { state: 'running' }, sync_enabled: true
    }) }),
    runApproval: async ({ onProviderStopped, onReady }) => {
      await onProviderStopped(); await onReady();
    },
    startWindows: vi.fn(),
    waitForFact: async () => { throw new Error('fact missing'); }
  })).rejects.toThrow('fact missing');
  expect(close).toHaveBeenCalledTimes(1);
});

it('does not start Windows before the B provider lifecycle is ready', async () => {
  const startWindows = vi.fn();
  await expect(runAOfflineAdmissionPrelude({
    createFact: async () => ({ factId: 'fact-a' }),
    openSession: async () => ({ close: vi.fn(), enable: async () => ({
      server_status: { state: 'running' }, sync_enabled: true
    }) }),
    runApproval: async () => { throw new Error('provider stop failed'); },
    startWindows, waitForFact: vi.fn()
  })).rejects.toThrow('provider stop failed');
  expect(startWindows).not.toHaveBeenCalled();
});

it('stops before product mutation when the A listener is not ready', async () => {
  const close = vi.fn(async () => undefined);
  const createFact = vi.fn();
  await expect(runAOfflineAdmissionPrelude({
    createFact,
    openSession: async () => ({ close, enable: async () => ({
      server_status: { state: 'stopped' }, sync_enabled: true
    }) }),
    runApproval: vi.fn(), startWindows: vi.fn(), waitForFact: vi.fn()
  })).rejects.toMatchObject({
    failureOwner: 'controller', host: 'macos-a', missingFact: 'a_product_listener_unavailable'
  });
  expect(createFact).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
