import { expect, it } from 'vitest';

import { hasFlowDayChanged } from './workspaceFlowDay';

it('keeps a synchronized creator day active until its absolute expiry in renderer action preparation', () => {
  const session = { currentNodeId: 'a', queueNodeIds: ['a'], isAnswerRevealed: false, totalNodeCount: 1,
    daily: { scope: 'receiver', revision: 2, dayKey: '2026-10-26T06:30:00.000Z' },
    dayWindow: { start: '2026-10-26T06:30:00.000Z', end: '2026-10-27T06:30:00.000Z' } };
  expect(hasFlowDayChanged(session, '2026-10-26T08:00:00.000Z')).toBe(false);
  expect(hasFlowDayChanged(session, '2026-10-26T06:29:30.000Z')).toBe(false);
  expect(hasFlowDayChanged(session, '2026-10-27T06:30:00.000Z')).toBe(true);
});
