// @vitest-environment node

import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import { performFreshJoinSequence } from './multi-device-sync-fresh-join.mjs';

it('joins as a Device before requesting public Sync Now and proves the exact fact after restart', async () => {
  const order = [];
  const step = (name, result) => vi.fn(async () => {
    order.push(name);
    return result;
  });
  const result = await performFreshJoinSequence({
    createFact: step('create-fact', { factId: 'fact-a' }),
    pair: step('join', { joined: true }),
    receive: step('receive', { database: { inspection: { journeyFacts: ['fact-a'] } } }),
    receiveAfterRestart: step('receive-after-restart', {
      database: { inspection: { journeyFacts: ['fact-a'] } }
    }),
    restart: step('restart'),
    syncNow: vi.fn(async (_factId, observe) => {
      order.push('sync-now');
      return observe();
    })
  });
  expect(order).toEqual([
    'create-fact', 'join', 'sync-now', 'receive', 'restart', 'receive-after-restart'
  ]);
  expect(result).toMatchObject({ mutationFact: { factId: 'fact-a' }, pairResult: { joined: true } });
});

it('keeps the formal A-B journey on the Device request contract', () => {
  const source = fs.readFileSync('scripts/sync-group/multi-device-sync-fresh-join.mjs', 'utf8');
  expect(source).toContain('waitForMacosDeviceRequest');
  expect(source).not.toMatch(/PairSync|pair_request|paired_authorizations/u);
});
