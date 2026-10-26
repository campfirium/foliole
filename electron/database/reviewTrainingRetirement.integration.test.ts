// @vitest-environment node
import { generatorParameters } from 'ts-fsrs';
import { expect, it } from 'vitest';

import { readReviewTrainingInput, readReviewTrainingPlan, readReviewTrainingPlanWithDb } from '../../lib/core/database/reviewTrainingInput.js';
import { readNodeReviewWeights, readReviewModels } from '../../lib/core/database/reviewTrainingModels.js';
import { readStoredReviewCard } from '../../lib/core/database/storedReviewCard.js';
import { recomputeReview } from '../../lib/core/review/recomputeReview.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { REVIEW_TRAINING_ENGINE, reviewModelKey, type ReviewTrainingModel } from '../../lib/core/review/trainingModel.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { identityReviewRowSchema } from '../../lib/core/sync/syncFactRowSchemas.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture, transfer } from './requestSyncRestoreRecovery.testSupport.js';
import { score, reviewState } from './reviewProjection.testSupport.js';
import { seedTrainingPeer } from './reviewTraining.testSupport.js';
import { writeSettingRecord } from './settingRecords.js';

function model(folderId: string | null, initialStability = 8): ReviewTrainingModel {
  const weights = [...generatorParameters().w];
  weights[0] = initialStability;
  return { folderId, weights, enabled: true, reviewCount: 2048, engine: REVIEW_TRAINING_ENGINE,
    trainedAt: '2026-10-27T00:00:00.000Z', candidate: { logLoss: 0.3, rmse: 0.2 }, baseline: { logLoss: 0.5, rmse: 0.4 } };
}

it('uses defaults for old global-only libraries and isolates top-level folders while preserving nearest folder overrides', async () => {
  const fixture = await restoreFixture(); const peer = fixture.peer('source');
  try {
    const driver = await seedTrainingPeer(peer);
    const save = (value: ReviewTrainingModel) => writeSettingRecord(driver, {
      key: reviewModelKey(value.folderId), valueJson: JSON.stringify(value), updatedAt: value.trainedAt
    });
    save(model(null));
    const before = reviewState(peer);
    expect(readNodeReviewWeights(driver, 'topic')).toBeUndefined();
    save(model('folder'));
    expect(readNodeReviewWeights(driver, 'topic')).toEqual(model('folder').weights);
    peer.sqlite.exec("UPDATE nodes SET parent_id='other' WHERE id='topic'");
    expect(readNodeReviewWeights(driver, 'topic')).toBeUndefined();
    peer.sqlite.exec("UPDATE nodes SET parent_id='folder' WHERE id='other'");
    expect(readNodeReviewWeights(driver, 'topic')).toEqual(model('folder').weights);
    save(model('other', 12));
    expect(readNodeReviewWeights(driver, 'topic')).toEqual(model('other', 12).weights);
    expect(reviewState(peer)).toEqual(before);
    peer.sqlite.exec("UPDATE nodes SET parent_id=NULL WHERE id='topic'");
    peer.reopen();
    const reopened = createBetterSqlite3Driver(peer.sqlite);
    expect(readNodeReviewWeights(reopened, 'topic')).toBeUndefined();
    score(peer, 'default-grade', '2026-10-27T08:00:00Z');
    const events = peer.sqlite.prepare("SELECT * FROM review_log WHERE node_id='topic'").all()
      .map(row => identityReviewRowSchema.parse(row));
    expect(readStoredReviewCard(reopened, 'topic')).toEqual(recomputeReview(events, DEFAULT_REVIEW_SCHEDULER_SETTINGS));
  } finally { await fixture.close(); }
});

it('keeps synced legacy global records inert after restart without changing facts, baselines or latest training', async () => {
  const fixture = await restoreFixture(); const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const driver = await seedTrainingPeer(source); await seedTrainingPeer(target);
    const legacy = model(null);
    writeSettingRecord(driver, { key: reviewModelKey(null), valueJson: JSON.stringify(legacy), updatedAt: legacy.trainedAt });
    const before = reviewState(target);
    const facts = target.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all();
    const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] })
      .find(row => row.objectType === 'setting' && row.globalId.endsWith(`:${reviewModelKey(null)}`))!;
    await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference);
    target.reopen();
    const reopened = createBetterSqlite3Driver(target.sqlite);
    expect(target.sqlite.prepare('SELECT value_json FROM setting_records WHERE key=?').get(reviewModelKey(null))).toBeDefined();
    expect(readReviewModels(reopened)).toEqual([]);
    expect(readNodeReviewWeights(reopened, 'topic')).toBeUndefined();
    const plan = readReviewTrainingPlan(reopened, 'scope');
    expect(plan).toMatchObject({ folders: [{ folderId: 'folder', reviewCount: 2048 }], lastTrainedAt: null, lastTrainedFolderId: null });
    expect(await readReviewTrainingPlanWithDb(target.db, 'scope')).toEqual(plan);
    expect(readReviewTrainingInput(reopened, 'folder', 'scope').baselineWeights).toBeNull();
    expect(() => readReviewTrainingInput(reopened, null, 'scope')).toThrow();
    expect(target.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(facts);
    expect(reviewState(target)).toEqual(before);
  } finally { await fixture.close(); }
});

it('aggregates descendant history for parents and compares children only against the nearest enabled ancestor', async () => {
  const fixture = await restoreFixture(); const peer = fixture.peer('source');
  try {
    const driver = await seedTrainingPeer(peer);
    peer.sqlite.exec("UPDATE nodes SET parent_id='other' WHERE id='folder'");
    const plan = readReviewTrainingPlan(driver, 'scope');
    expect(plan.folders).toEqual([{ folderId: 'other', reviewCount: 2048 }, { folderId: 'folder', reviewCount: 2048 }]);
    expect(readReviewTrainingInput(driver, 'other', 'scope').events).toEqual(readReviewTrainingInput(driver, 'folder', 'scope').events);
    const parent = model('other');
    for (const entry of [model(null, 12), parent]) writeSettingRecord(driver, {
      key: reviewModelKey(entry.folderId), valueJson: JSON.stringify(entry), updatedAt: entry.trainedAt
    });
    expect(readReviewTrainingInput(driver, 'folder', 'scope').baselineWeights).toEqual(parent.weights);
  } finally { await fixture.close(); }
});

it('keeps root and special-container history on defaults without creating a training scope', async () => {
  const fixture = await restoreFixture(); const peer = fixture.peer('source');
  try {
    const driver = await seedTrainingPeer(peer);
    const legacy = model(null);
    writeSettingRecord(driver, { key: reviewModelKey(null), valueJson: JSON.stringify(legacy), updatedAt: legacy.trainedAt });
    peer.sqlite.exec("INSERT INTO nodes(id,kind,title,created_at,updated_at) VALUES ('special-inbox','folder','Inbox','now','now'); UPDATE nodes SET parent_id='special-inbox' WHERE parent_id='folder'");
    expect(readNodeReviewWeights(driver, 'topic')).toBeUndefined();
    expect(readReviewTrainingPlan(driver, 'scope').folders).toEqual([]);
    peer.sqlite.exec("UPDATE nodes SET parent_id=NULL WHERE parent_id='special-inbox'");
    expect(readNodeReviewWeights(driver, 'topic')).toBeUndefined();
    expect(readReviewTrainingPlan(driver, 'scope').folders).toEqual([]);
  } finally { await fixture.close(); }
});
