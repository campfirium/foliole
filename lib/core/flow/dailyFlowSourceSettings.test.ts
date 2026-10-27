import { expect, it } from 'vitest';

import { dailyFlowSourceSettingsSchema } from './dailyFlowSourceSettings.js';

const args = { scope: 'library', sourceNodeId: 'folder', now: '2026-10-28T01:00:00.000Z',
  before: { manualChildOrder: null, sequentialReadingEnabled: null },
  after: { manualChildOrder: ['a', 'b'], sequentialReadingEnabled: true }, readings: [] };

it('accepts only scoped source preferences and typed learning comparisons', () => {
  expect(dailyFlowSourceSettingsSchema.parse(args)).toEqual(args);
  for (const patch of [{ scope: '' }, { sql: 'DELETE FROM nodes' }, { after: { content: 'replacement' } },
    { readings: [{ nodeId: 'a', before: null, after: { state: 'locked' } }] }]) {
    expect(dailyFlowSourceSettingsSchema.safeParse({ ...args, ...patch }).success).toBe(false);
  }
});
