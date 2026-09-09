// @vitest-environment node

import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import {
  performFreshJoinSequence, prepareA5ForFreshJoin
} from './multi-device-sync-fresh-join.mjs';

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
  expect(source).toContain('expectedGroupId: groupIdentity.group_id');
  expect(source).toContain('expectedGroupTag: groupIdentity.group_tag');
  expect(source).not.toMatch(/PairSync|pair_request|paired_authorizations/u);
});

it('leaves a previously joined A5 through the product before a fresh formal join', async () => {
  const inspections = [
    { database: { inspection: { syncGroupId: 'group-old' } } },
    { database: { inspection: { syncGroupId: null } } }
  ];
  const leave = vi.fn(async () => ({ manifestPath: '/evidence/leave.json' }));
  const result = await prepareA5ForFreshJoin({ buildIdentity: 'run-1', env: {},
    evidenceRoot: '/evidence', execute: vi.fn(), inspect: async () => inspections.shift(),
    leave, paths: { adb: '/adb', buildRoot: '/repo' } });
  expect(result).toEqual({ leftExistingGroup: true, previousGroupId: 'group-old' });
  expect(leave).toHaveBeenCalledWith(expect.objectContaining({
    action: 'leave-sync-group', installMain: false
  }));
});

it('preserves an already unbound A5 without invoking a departure', async () => {
  const leave = vi.fn();
  await expect(prepareA5ForFreshJoin({ buildIdentity: 'run-2', env: {},
    evidenceRoot: '/evidence', execute: vi.fn(),
    inspect: async () => ({ database: { inspection: { syncGroupId: null } } }),
    leave, paths: {} })).resolves.toEqual({ leftExistingGroup: false, previousGroupId: null });
  expect(leave).not.toHaveBeenCalled();
});

it('rejects a product departure that leaves the previous group active', async () => {
  const snapshot = { database: { inspection: { syncGroupId: 'group-old' } } };
  await expect(prepareA5ForFreshJoin({ buildIdentity: 'run-3', env: {},
    evidenceRoot: '/evidence', execute: vi.fn(), inspect: async () => snapshot,
    leave: vi.fn(async () => ({})), paths: {} })).rejects.toMatchObject({
    failureOwner: 'product', missingFact: 'a5_previous_group_departure'
  });
});
