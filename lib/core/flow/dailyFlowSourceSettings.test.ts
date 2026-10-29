import { expect, it } from 'vitest';

import { dailyFlowSourceSettingsSchema } from './dailyFlowSourceSettings.js';

const args = { defaultPriority: 5, scope: 'library', sourceNodeId: 'folder', now: '2026-10-28T01:00:00.000Z',
  before: { shelvedAt: null, manualChildOrder: null, sequentialReadingEnabled: null },
  after: { shelvedAt: null, manualChildOrder: ['a', 'b'], sequentialReadingEnabled: true }, readings: [] };

it('accepts only scoped source preferences and typed learning comparisons', () => {
  expect(dailyFlowSourceSettingsSchema.parse(args)).toEqual(args);
  for (const patch of [{ scope: '' }, { sql: 'DELETE FROM nodes' }, { after: { content: 'replacement' } },
    { readings: [{ nodeId: 'a', before: null, after: { state: 'locked' } }] }]) {
    expect(dailyFlowSourceSettingsSchema.safeParse({ ...args, ...patch }).success).toBe(false);
  }
});

it('limits complete guarded learning comparisons to an explicit shelve transition', () => {
  const guardedReadings = [{ nodeId: 'a', before: null, after: null }];
  expect(dailyFlowSourceSettingsSchema.safeParse({ ...args, guardedReadings }).success).toBe(false);
  const shelve = { ...args, after: { ...args.after, shelvedAt: args.now }, guardedReadings };
  expect(dailyFlowSourceSettingsSchema.safeParse(shelve).success).toBe(true);
  expect(dailyFlowSourceSettingsSchema.safeParse({ ...shelve,
    readings: [{ nodeId: 'a', before: null, after: 'active' }] }).success).toBe(false);
});
