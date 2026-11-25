// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';

import { seedCompanionReviewHistory } from './companionFlowHistory.testSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-10-28T01:00:00.000Z';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => { library = await createSearchLibrary(0); });
afterEach(async () => { await library.close(); });

async function openFlowWith(items: Record<string, [content: string, reveal: string | null]>) {
  await seedCompanionReviewHistory({ due: '2026-10-01T00:00:00.000Z', lastReviewAt: '2026-09-28T00:00:00.000Z',
    state: 2, stability: 3, difficulty: 4, elapsedDays: 3, scheduledDays: 3, reps: 2, lapses: 0 }, now, Object.keys(items));
  const update = library.database.prepare('UPDATE nodes SET content = ?, reveal = ?, body_blob_hash = NULL WHERE id = ?');
  for (const [id, [content, reveal]] of Object.entries(items)) update.run(content, reveal, id);
  return (await openCompanionDailyFlow({ now, mode: 'review-first' })).session;
}

it('never puts a completely empty Item on screen in Flow', async () => {
  const session = await openFlowWith({ blank: ['', null] });

  expect(session.currentNodeId).toBeNull();
});

it('counts half-filled Items but not the completely empty one', async () => {
  const session = await openFlowWith({ blank: ['', null], 'question-only': ['Question', null], 'answer-only': ['', 'Answer'] });

  expect(session.currentNodeId).not.toBe('blank');
  expect(session.totalNodeCount).toBe(2);
});
