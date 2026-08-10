import { expect, it } from 'vitest';

import { createSyncProgressWatchdog } from './sync-progress-watchdog.mjs';

it('allows a long operation while its durable facts keep advancing', () => {
  let current = 0;
  const observe = createSyncProgressWatchdog({
    label: 'ordinary sync', now: () => current, stallMs: 90_000
  });
  observe('0', { nodes: 0 });
  current = 80_000;
  observe('1', { nodes: 1 });
  current = 160_000;
  expect(() => observe('2', { nodes: 2 })).not.toThrow();
});

it('fails one stalled stage without waiting for the whole journey ceiling', () => {
  let current = 0;
  const observe = createSyncProgressWatchdog({
    label: 'ordinary sync', now: () => current, stallMs: 90_000
  });
  observe('same', { nodes: 2 });
  current = 90_000;
  expect(() => observe('same', { nodes: 2 })).toThrow(
    'ordinary sync made no progress for 90 seconds'
  );
});
