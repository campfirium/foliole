// @vitest-environment node
import { generatorParameters } from 'ts-fsrs';
import { expect, it, vi } from 'vitest';

import { readReviewTrainingInput, readReviewTrainingInputWithDb } from '../../lib/core/database/reviewTrainingInput.js';
import { REVIEW_MODELS_SQL, REVIEW_TRAINING_NODES_SQL } from '../../lib/core/database/reviewTrainingModels.js';
import { REVIEW_TRAINING_ENGINE, reviewModelKey, type ReviewTrainingModel } from '../../lib/core/review/trainingModel.js';

import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { seedTrainingPeer } from './reviewTraining.testSupport.js';
import { writeSettingRecord } from './settingRecords.js';

for (const asynchronous of [false, true]) {
  it(`prepares complete fresh folder input without materializing nodes or models twice (${asynchronous ? 'DbPort' : 'driver'})`, async () => {
    const fixture = await restoreFixture();
    const peer = fixture.peer('source');
    try {
      const driver = await seedTrainingPeer(peer);
      peer.sqlite.exec("UPDATE nodes SET parent_id='other' WHERE id='folder'; UPDATE nodes SET enable_short_term=0 WHERE id='other'");
      const model: ReviewTrainingModel = { folderId: 'other', weights: [...generatorParameters().w],
        enabled: true, reviewCount: 2048, engine: REVIEW_TRAINING_ENGINE,
        trainedAt: '2026-10-27T00:00:00Z', candidate: { logLoss: 0.3, rmse: 0.2 }, baseline: { logLoss: 0.5, rmse: 0.4 } };
      const expected = readReviewTrainingInput(driver, 'folder', 'scope');
      const db = peer.db;
      const reads = asynchronous ? vi.spyOn(db, 'query') : vi.spyOn(driver, 'queryAll');
      const load = () => asynchronous ? readReviewTrainingInputWithDb(db, 'folder', 'scope')
        : readReviewTrainingInput(driver, 'folder', 'scope');
      expect(await load()).toEqual(expected);
      expect(reads.mock.calls.filter(([sql]) => sql === REVIEW_TRAINING_NODES_SQL)).toHaveLength(1);
      expect(reads.mock.calls.filter(([sql]) => sql === REVIEW_MODELS_SQL)).toHaveLength(1);
      reads.mockClear();
      writeSettingRecord(driver, { key: reviewModelKey('other'), valueJson: JSON.stringify(model), updatedAt: model.trainedAt });
      peer.sqlite.exec("UPDATE nodes SET enable_short_term=1 WHERE id='other'");
      expect(await load()).toEqual({ ...expected, baselineWeights: model.weights, enableShortTerm: true });
      peer.sqlite.exec("UPDATE nodes SET parent_id=NULL WHERE id='folder'");
      expect(await load()).toEqual({ ...expected, baselineWeights: null });
      const own = { ...model, folderId: 'folder' };
      writeSettingRecord(driver, { key: reviewModelKey('folder'), valueJson: JSON.stringify(own), updatedAt: own.trainedAt });
      await expect(Promise.resolve().then(load)).rejects.toThrow('review_training_threshold_not_reached');
    } finally { vi.restoreAllMocks(); await fixture.close(); }
  });
}
