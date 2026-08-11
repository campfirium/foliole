import { expect, it, vi } from 'vitest';

import { runAOfflineAdmissionPrelude } from './multi-device-sync-fact-preparation.mjs';

it('creates on A, proves B received the fact, takes A offline, then starts C', async () => {
  const events = [];
  const close = vi.fn(async () => { events.push('a-offline'); });
  const result = await runAOfflineAdmissionPrelude({
    createFact: async () => { events.push('a-fact-created'); return { factId: 'fact-a' }; },
    openSession: async () => ({ close }),
    runApproval: async (onReady) => { await onReady(); events.push('c-approved'); return 'approval'; },
    startWindows: async () => { events.push('c-started'); return 'windows'; },
    waitForFact: async (factId) => { events.push(`b-received-${factId}`); }
  });
  expect(events).toEqual([
    'a-fact-created', 'b-received-fact-a', 'a-offline', 'c-started', 'c-approved'
  ]);
  expect(close).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ approval: 'approval', windows: 'windows' });
});
