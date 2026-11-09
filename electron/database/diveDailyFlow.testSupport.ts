import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState.js';
import { applyReviewGrade } from '../../lib/core/database/reviewMutations.js';
import type { DailyFlowCommitArgs } from '../../lib/core/flow/dailyFlowContract.js';
import { loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import { commitDailyFlow, openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import { createFsrsReviewScheduler } from '../../lib/core/review/fsrsScheduler.js';
import { createReviewSchedulerParameters, DEFAULT_REVIEW_SCHEDULER_SETTINGS, getReviewSchedulerVersion } from '../../lib/core/review/settings.js';

import { createDive } from './diveRepository.js';
import { createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

export const now = '2026-10-28T08:00:00.000Z';
export const tomorrow = '2026-10-29T08:00:00.000Z';
const schedulerSettings = DEFAULT_REVIEW_SCHEDULER_SETTINGS;
export const scheduler = createFsrsReviewScheduler({ loadSettings: () => schedulerSettings,
  getSettingsVersion: getReviewSchedulerVersion, createParameters: createReviewSchedulerParameters });

export function addNode(peer: Peer, id: string, priority: number, kind: 'topic' | 'item', parent: string | null = null) {
  peer.db.prepare(`INSERT INTO nodes (id, parent_id, kind, priority, title, content, reveal, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z', ?)`)
    .run(id, parent, kind, priority, id, `Prompt ${id}`, kind === 'item' ? 'Answer' : null, now);

}

export async function setup(kind: 'topic' | 'item') {
  await startLibraries();
  const peer = createPeer('desktop');
  for (const [index, id] of ['a', 'b', 'c', 'd'].entries()) {
    if (kind === 'item') addNode(peer, `topic-${id}`, index, 'topic');
    addNode(peer, id, index, kind, kind === 'item' ? `topic-${id}` : null);
  }
  const settings = { scope: peer.file, newDayStartsAtHour: 4, pushQueue: schedulerSettings.pushQueue };
  const persistence: DailyFlowPersistence = {
    learningSnapshot: (db, ids) => loadDailyFlowLearningSnapshot(db, 'desktop', ids),
    snapshot: async () => { throw new Error('Expected scoped learning facts'); },
    grade: async (_db, value, opId) => applyReviewGrade(peer.driver, { ...value, opId },
      { hostName: peer.name, createId: () => `${opId}-log` }),
    reading: async (_db, value, updatedAt) => { saveNodeReadingStateWithSync(peer.driver,
      { nodeId: value.nodeId, reading: value.after, updatedAt, hostName: peer.name }); },
    reviewHistory: async (_db, value, updatedAt) => saveNodeReviewStateWithSync(peer.driver,
      { nodeId: value.nodeId, review: value.after, updatedAt, hostName: peer.name,
        history: { mode: value.mode, targetOpId: value.targetOpId } })
  };
  const mode = kind === 'item' ? 'review-first' : 'reading-only';
  return { peer, mode, scope: (topicIds: string[]) => ({ id: createDive(peer.db, 'Test Dive', topicIds).id, topicIds }),
    facts: () => persistence.learningSnapshot(peer.port),
    open: (overrides: Partial<Parameters<typeof openDailyFlow>[1]> = {}) =>
      openDailyFlow(peer.port, { now, mode, ...overrides }, settings, persistence),
    commit: (command: DailyFlowCommitArgs) => commitDailyFlow(peer.port, command, settings, persistence) };
}

export const reading = { intervalDurationMs: 86400000, intervalGrowthFactor: 2, lastHandledAt: now,
  nextAt: tomorrow, priority: 1, readingPosition: 0, repetitionCount: 1, state: 'active' } as const;

export function readArgs(nodeId: string) {
  return { readingAction: 'read', readings: [{ nodeId, before: null, after: reading }] } as const;
}
