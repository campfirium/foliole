import { generatorParameters } from 'ts-fsrs';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver';
import { restoreFixture } from '../../electron/database/requestSyncRestoreRecovery.testSupport';
import { writeSettingRecord } from '../../electron/database/settingRecords';
import { reviewModelKey, REVIEW_TRAINING_ENGINE, type ReviewTrainingModel } from '../../lib/core/review/trainingModel';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';

export function mobileReviewModel(folderId: string | null): ReviewTrainingModel {
  const weights = [...generatorParameters().w];
  weights[0] = 3; weights[1] = 5; weights[2] = 12; weights[3] = 30;
  return { folderId, weights, enabled: true, reviewCount: 2048, trainedAt: '2026-10-25T12:00:00.000Z',
    engine: REVIEW_TRAINING_ENGINE, baseline: { logLoss: 0.5, rmse: 0.3 }, candidate: { logLoss: 0.4, rmse: 0.2 } };
}

/** Independent desktop SQLite sends a setting using the production request/framed sync path. */
export async function receiveMobileReviewModel(model: ReviewTrainingModel) {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  try {
    await writeIosCompanionDatabase(async db => {
      await db.run("INSERT OR IGNORE INTO sync_groups VALUES ('group', 'Group', 'secret', 'now', 'now')");
      await db.run("INSERT OR IGNORE INTO sync_group_local_state VALUES (1, 'group', 'mobile', 'active', 'now')");
      await db.run("UPDATE node_version_local_proof_state SET library_epoch='mobile-epoch'");
      for (const id of ['source', 'mobile']) await db.run(`INSERT OR IGNORE INTO sync_group_devices
        (group_id, device_identity_key, device_anchor, canonical_library_path, device_name, platform, state, joined_at, updated_at)
        VALUES ('group', ?, ?, ?, ?, 'android', 'active', 'now', 'now')`, [id, id, `/${id}`, id]);
    });
    source.sqlite.prepare("INSERT INTO settings(key, value, updated_at) VALUES ('host_name', ?, 'now')").run('"Desktop fixture"');
    writeSettingRecord(createBetterSqlite3Driver(source.sqlite), { key: reviewModelKey(model.folderId),
      valueJson: JSON.stringify(model), updatedAt: model.trainedAt });
    const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] })
      .find(value => value.objectType === 'setting' && value.globalId.endsWith(`:${reviewModelKey(model.folderId)}`))!;
    await withRequestSyncFiles(source.host.files, async request => {
      await writeRequestSyncSnapshot(source.db, { ...difference, direction: 'local_to_remote' }, request);
      await writeIosCompanionDatabase(db => db.transaction(tx => applyRequestSyncObject(tx, {
        context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, senderDeviceId: source.id,
          senderLibraryEpoch: source.epoch, receiverDeviceId: 'mobile', receiverLibraryEpoch: 'mobile-epoch' },
        peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
          library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
        objectType: 'setting', globalId: difference.globalId, requestId: new Uint8Array(16),
        enqueueSearchInvalidations: false, facts: () => request.readFacts(), loadBody: (_db, blob) => request.loadBody(blob)
      })));
    });
  } finally { await fixture.close(); }
}
