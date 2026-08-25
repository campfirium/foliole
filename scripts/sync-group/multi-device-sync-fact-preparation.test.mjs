import { expect, it, vi } from 'vitest';

import { runAOfflineAdmissionPrelude } from './multi-device-sync-fact-preparation.mjs';

it('creates on A, proves B received the fact, takes A offline, then starts C', async () => {
  const events = [];
  const milestones = [];
  const close = vi.fn(async () => { events.push('a-offline'); });
  const result = await runAOfflineAdmissionPrelude({
    closeTransport: async () => { events.push('b-transport-closed'); },
    createFact: async () => { events.push('a-fact-created'); return { factId: 'fact-a' }; },
    openSession: async () => ({ close, enable: async () => {
      events.push('a-listener-ready');
      return { server_status: { state: 'running' }, sync_enabled: true };
    } }),
    openTransport: async () => { events.push('b-transport-open'); },
    reportProgress: (milestone) => milestones.push(milestone),
    runApproval: async ({ onProviderStopped, onReady }) => {
      events.push('b-provider-stopped'); await onProviderStopped();
      events.push('b-started'); await onReady(); events.push('c-approved'); return 'approval';
    },
    startWindows: async () => { events.push('c-started'); return 'windows'; },
    waitForFact: async (factId) => { events.push(`b-received-${factId}`); }
  });
  expect(events).toEqual([
    'a-listener-ready', 'a-fact-created', 'b-provider-stopped', 'b-transport-open', 'b-started',
    'b-received-fact-a',
    'b-transport-closed', 'a-offline', 'c-started', 'c-approved'
  ]);
  expect(close).toHaveBeenCalledTimes(1);
  expect(milestones).toEqual([
    'a-listener-ready', 'a-fact-created', 'b-provider-stopped', 'b-transport-ready',
    'b-fact-received', 'a-offline', 'c-join-started', 'b-approval-completed'
  ]);
  expect(result).toMatchObject({ approval: 'approval', windows: 'windows' });
});

it('closes the product transport when B never receives the A fact', async () => {
  const closeTransport = vi.fn(async () => undefined);
  await expect(runAOfflineAdmissionPrelude({
    closeTransport,
    createFact: async () => ({ factId: 'fact-a' }),
    openSession: async () => ({ close: vi.fn(async () => undefined), enable: async () => ({
      server_status: { state: 'running' }, sync_enabled: true
    }) }),
    openTransport: async () => undefined,
    runApproval: async ({ onProviderStopped, onReady }) => {
      await onProviderStopped(); await onReady();
    },
    startWindows: vi.fn(),
    waitForFact: async () => { throw new Error('fact missing'); }
  })).rejects.toThrow('fact missing');
  expect(closeTransport).toHaveBeenCalledTimes(1);
});

it('does not open transport before the B provider lifecycle is stopped', async () => {
  const openTransport = vi.fn();
  await expect(runAOfflineAdmissionPrelude({
    closeTransport: vi.fn(), createFact: async () => ({ factId: 'fact-a' }),
    openSession: async () => ({ close: vi.fn(), enable: async () => ({
      server_status: { state: 'running' }, sync_enabled: true
    }) }),
    openTransport,
    runApproval: async () => { throw new Error('provider stop failed'); },
    startWindows: vi.fn(), waitForFact: vi.fn()
  })).rejects.toThrow('provider stop failed');
  expect(openTransport).not.toHaveBeenCalled();
});

it('stops before product mutation when the A listener is not ready', async () => {
  const close = vi.fn(async () => undefined);
  const createFact = vi.fn();
  const openTransport = vi.fn();
  await expect(runAOfflineAdmissionPrelude({
    closeTransport: vi.fn(), createFact,
    openSession: async () => ({ close, enable: async () => ({
      server_status: { state: 'stopped' }, sync_enabled: true
    }) }),
    openTransport, runApproval: vi.fn(), startWindows: vi.fn(), waitForFact: vi.fn()
  })).rejects.toMatchObject({
    failureOwner: 'controller', host: 'macos-a', missingFact: 'a_product_listener_unavailable'
  });
  expect(createFact).not.toHaveBeenCalled();
  expect(openTransport).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
