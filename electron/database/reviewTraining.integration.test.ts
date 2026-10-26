// @vitest-environment node
import { readFileSync } from 'node:fs';

import { beforeAll, expect, it, vi } from 'vitest';

import { readReviewTrainingInput, readReviewTrainingPlan } from '../../lib/core/database/reviewTrainingInput.js';
import { readNodeReviewWeights, readReviewModels } from '../../lib/core/database/reviewTrainingModels.js';
import { readStoredReviewCard } from '../../lib/core/database/storedReviewCard.js';
import { recomputeReview } from '../../lib/core/review/recomputeReview.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { reviewTrainingCutoff } from '../../lib/core/review/trainingHistory.js';
import { reviewModelKey, reviewTrainingModelSchema } from '../../lib/core/review/trainingModel.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { identityReviewRowSchema } from '../../lib/core/sync/syncFactRowSchemas.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture, transfer } from './requestSyncRestoreRecovery.testSupport.js';
import { score, reviewState, sendReviews } from './reviewProjection.testSupport.js';
import { seedTrainingPeer } from './reviewTraining.testSupport.js';
import { writeSettingRecord } from './settingRecords.js';

let train: typeof import('../../src/features/review/model/trainFolderReviewModel.js').trainFolderReviewModel;
beforeAll(async () => {
  vi.stubGlobal('self', new EventTarget());
  const wasm = await import('fsrs-browser/fsrs_browser.js');
  wasm.initSync({ module: readFileSync('node_modules/fsrs-browser/fsrs_browser_bg.wasm') });
  train = (await import('../../src/features/review/model/trainFolderReviewModel.js')).trainFolderReviewModel;
});

it('trains on folder facts, syncs parameters, and uses them for the next durable grade after restart', async () => {
  const fixture = await restoreFixture(); const a = fixture.peer('source'); const b = fixture.peer('target');
  try {
    const driver = await seedTrainingPeer(a); await seedTrainingPeer(b);
    const input = readReviewTrainingInput(driver, 'folder', 'test-library');
    const model = train(input);
    expect(model.enabled).toBe(true);
    expect(model.candidate!.logLoss).toBeLessThan(model.baseline!.logLoss);
    expect(model.candidate!.rmse).toBeLessThan(model.baseline!.rmse);
    const before = reviewState(a);
    writeSettingRecord(driver, { key: reviewModelKey('folder'), valueJson: JSON.stringify(model), updatedAt: model.trainedAt });
    expect(reviewState(a)).toEqual(before);
    const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(a.db), remote: [] })
      .find(value => value.objectType === 'setting' && value.globalId.endsWith(`:${reviewModelKey('folder')}`));
    expect(difference).toBeDefined();
    await transfer(a, b, { groupId: 'group', overwriteId: 'unused', providerDeviceId: a.id,
      providerLibraryEpoch: a.epoch, receiverDeviceId: b.id, receiverLibraryEpoch: b.epoch }, difference!);
    expect(reviewState(b)).toEqual(before);
    a.reopen(); b.reopen();
    score(a, 'score-a', '2026-10-26T08:00:00.000Z');
    await sendReviews(a, b);
    expect(reviewState(a)).toEqual(reviewState(b));
    score(b, 'score-b', '2026-10-27T08:00:00.000Z');
    await sendReviews(b, a);
    for (const peer of [a, b]) {
      const reopened = createBetterSqlite3Driver(peer.sqlite);
      expect(readReviewModels(reopened)).toEqual([model]);
      expect(readNodeReviewWeights(reopened, 'topic')).toEqual(model.weights);
      const result = readStoredReviewCard(reopened, 'topic');
      const events = peer.sqlite.prepare("SELECT * FROM review_log WHERE node_id='topic'").all().map(row => identityReviewRowSchema.parse(row));
      expect(result).toEqual(recomputeReview(events, { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, weights: model.weights }));
      expect(result).not.toEqual(recomputeReview(events, DEFAULT_REVIEW_SCHEDULER_SETTINGS));
    }
    expect(reviewState(a)).toEqual(reviewState(b));
  } finally { await fixture.close(); }
});

it('counts valid synced facts once and keeps resets in history without counting them as grades', async () => {
  const fixture = await restoreFixture(); const peer = fixture.peer('source');
  try {
    const driver = await seedTrainingPeer(peer, 1024);
    expect(readReviewTrainingPlan(driver, 'scope').folders.map(folder => folder.folderId)).toEqual([null, 'folder']);
    peer.sqlite.exec(`INSERT INTO review_log(id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind, voids_op_id)
      VALUES ('reset', 'reset', 'fixture', 'topic', 0, '', '2025-02-01T08:00:00Z', 'reset', NULL),
        ('void', 'void', 'fixture', 'topic', 0, '', '2025-03-01T08:00:00Z', 'void', 'sample-0')`);
    expect(readReviewTrainingPlan(driver, 'scope').folders).toEqual([]);
    expect(() => readReviewTrainingInput(driver, 'folder', 'scope')).toThrow('review_training_threshold_not_reached');
    score(peer, 'replacement', '2026-10-26T08:00:00Z');
    const input = readReviewTrainingInput(driver, 'folder', 'scope');
    expect(input.reviewCount).toBe(1024);
    expect(input.events.some(event => event.kind === 'reset')).toBe(true);
    expect(input.events.some(event => event.opId === 'sample-0')).toBe(false);
    expect(input.events.some(event => event.opId === 'sample-1')).toBe(true);
  } finally { await fixture.close(); }
});

it('inherits enabled folder parameters and changes ownership when an item moves', async () => {
  const fixture = await restoreFixture(); const peer = fixture.peer('source');
  try {
    const driver = await seedTrainingPeer(peer);
    const model = train(readReviewTrainingInput(driver, 'folder', 'scope'));
    writeSettingRecord(driver, { key: reviewModelKey('folder'), valueJson: JSON.stringify(model), updatedAt: model.trainedAt });
    const before = reviewState(peer);
    peer.sqlite.exec("UPDATE nodes SET parent_id='other' WHERE id='topic'");
    expect(readNodeReviewWeights(driver, 'topic')).toBeUndefined();
    expect(reviewState(peer)).toEqual(before);
    expect(readReviewTrainingPlan(driver, 'scope').folders.find(folder => folder.folderId === 'other')).toBeUndefined();
    peer.sqlite.exec("UPDATE nodes SET parent_id='folder' WHERE id='other'; UPDATE nodes SET parent_id='other' WHERE id='topic'");
    expect(readNodeReviewWeights(driver, 'topic')).toEqual(model.weights);
    const rejected = { ...model, folderId: 'other', enabled: false, candidate: model.baseline };
    writeSettingRecord(driver, { key: reviewModelKey('other'), valueJson: JSON.stringify(rejected), updatedAt: model.trainedAt });
    expect(readNodeReviewWeights(driver, 'topic')).toEqual(model.weights);
    expect(reviewTrainingModelSchema.safeParse({ ...model, candidate: model.baseline }).success).toBe(false);
  } finally { await fixture.close(); }
});

it('never trains on held-out answers and preserves input when review events arrive in a different order', async () => {
  const fixture = await restoreFixture(); const peer = fixture.peer('source');
  try {
    const driver = await seedTrainingPeer(peer);
    const input = readReviewTrainingInput(driver, 'folder', 'scope');
    const original = train(input);
    const cutoff = reviewTrainingCutoff(input.events);
    const changed = train({ ...input, events: input.events.map(event =>
      Date.parse(event.reviewedAt) >= cutoff ? { ...event, grade: event.grade === 1 ? 3 : 1 } : event).reverse() });
    expect(changed.weights).toEqual(original.weights);
    expect(changed.candidate).not.toEqual(original.candidate);
    const unchanged = train({ ...input, baselineWeights: original.weights });
    expect(unchanged.enabled).toBe(false);
  } finally { await fixture.close(); }
});
