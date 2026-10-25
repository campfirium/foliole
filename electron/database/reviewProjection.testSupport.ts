import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState.js';
import { applyReviewGrade, resetNodeReviewState } from '../../lib/core/database/reviewMutations.js';
import { readStoredReviewCard } from '../../lib/core/database/storedReviewCard.js';
import { createFsrsReviewScheduler } from '../../lib/core/review/fsrsScheduler.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, createReviewSchedulerParameters, getReviewSchedulerVersion } from '../../lib/core/review/settings.js';
import { createInitialSchedulerCard, mapGradeToRustRating } from '../../lib/core/review/types.js';
import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

export const firstAt = '2026-10-01T08:00:00.000Z';
export const secondAt = '2026-10-03T08:00:00.000Z';
export async function seedReviewPeer(peer: RestorePeer) {
  const node = textBranch('original', 'Question', undefined, firstAt);
  await applySyncNodesWithDbPort(peer.db, [{ ...node, snapshot: { ...node.snapshot, kind: 'item' } }], { enqueueSearchInvalidations: false });
}
export function score(peer: RestorePeer, opId: string, at: string, grade: 1 | 2 | 3 | 4 = 3) {
  const driver = createBetterSqlite3Driver(peer.sqlite);
  const cardBefore = readStoredReviewCard(driver, 'topic') ?? createInitialSchedulerCard(at);
  const cardAfter = createFsrsReviewScheduler({ loadSettings: () => DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    getSettingsVersion: getReviewSchedulerVersion, createParameters: createReviewSchedulerParameters })
    .grade({ card: cardBefore, rating: mapGradeToRustRating(grade), now: at }).card;
  return applyReviewGrade(driver, {
    nodeId: 'topic', opId, grade, reviewedAt: at, schedulerVersion: 'untrusted-snapshot-version',
    cardBefore, cardAfter
  }, { hostName: peer.id, createId: () => `${opId}-log` });
}
export function reset(peer: RestorePeer, at: string) {
  resetNodeReviewState(createBetterSqlite3Driver(peer.sqlite), 'topic', { hostName: peer.id, deletedAt: at });
}
export function history(peer: RestorePeer, mode: 'undo' | 'redo', target: string, at: string) {
  return saveNodeReviewStateWithSync(createBetterSqlite3Driver(peer.sqlite), {
    nodeId: 'topic', review: null, hostName: peer.id, updatedAt: at, history: { mode, targetOpId: target }
  });
}
export const reviewState = (peer: RestorePeer) => peer.sqlite.prepare('SELECT * FROM node_review ORDER BY node_id').all();
export const reviewFacts = (peer: RestorePeer) => peer.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all();
export async function sendReviews(source: RestorePeer, target: RestorePeer, enqueueSearchInvalidations = true, extraFacts: CanonicalFact[] = []) {
  const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] })
    .find(value => value.globalId === 'topic' && value.objectType === 'node');
  if (!difference) throw new Error('missing_test_inventory');
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference, enqueueSearchInvalidations, extraFacts);
}
