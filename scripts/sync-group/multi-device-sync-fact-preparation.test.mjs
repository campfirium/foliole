import { expect, it, vi } from 'vitest';

import { runAOfflineAdmissionPrelude } from './multi-device-sync-fact-preparation.mjs';

it('creates on A, proves B received the fact, takes A offline, then starts C', async () => {
  const events = [];
  const close = vi.fn(async () => { events.push('a-offline'); });
  const result = await runAOfflineAdmissionPrelude({
    closeTransport: async () => { events.push('b-transport-closed'); },
    createFact: async () => { events.push('a-fact-created'); return { factId: 'fact-a' }; },
    openSession: async () => ({ close }),
    openTransport: async () => { events.push('b-transport-open'); },
    runApproval: async (onReady) => {
      events.push('b-started'); await onReady(); events.push('c-approved'); return 'approval';
    },
    startWindows: async () => { events.push('c-started'); return 'windows'; },
    waitForFact: async (factId) => { events.push(`b-received-${factId}`); }
  });
  expect(events).toEqual([
    'a-fact-created', 'b-transport-open', 'b-started', 'b-received-fact-a',
    'b-transport-closed', 'a-offline', 'c-started', 'c-approved'
  ]);
  expect(close).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ approval: 'approval', windows: 'windows' });
});

it('closes the product transport when B never receives the A fact', async () => {
  const closeTransport = vi.fn(async () => undefined);
  await expect(runAOfflineAdmissionPrelude({
    closeTransport,
    createFact: async () => ({ factId: 'fact-a' }),
    openSession: async () => ({ close: vi.fn(async () => undefined) }),
    openTransport: async () => undefined,
    runApproval: async (onReady) => onReady(),
    startWindows: vi.fn(),
    waitForFact: async () => { throw new Error('fact missing'); }
  })).rejects.toThrow('fact missing');
  expect(closeTransport).toHaveBeenCalledTimes(1);
});
