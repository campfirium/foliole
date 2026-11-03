import {
  mergeReviewSchedulerSettingsPatch,
  normalizeReviewSchedulerSettings,
  type ReviewSchedulerSettingsSavePatch
} from '../../../../../lib/core/review/settings';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import {
  hydrateCurrentReviewSchedulerSettings
} from '../../../../features/settings/model/reviewSchedulerSettings';
import { hasCompanionLocalDatabase, getCompanionRuntimeCapability } from '../../companionRuntimeCapabilities';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';
import { saveIosSettingWithDb } from '../runtime/iosCompanionActiveDatabaseWrites';
import { runCompanionSyncMutationTask } from '../sync/mutation/companionSyncMutationRevision';

const KEY = 'review_scheduler_settings';

async function readSettings(db: DbPort) {
  const [row] = await db.query<{ value_json: string }>(
    `SELECT value_json FROM setting_records WHERE key = ? AND scope = 'user_space'
      ORDER BY updated_at DESC, content_hash DESC LIMIT 1`, [KEY]
  );
  return normalizeReviewSchedulerSettings(row ? JSON.parse(row.value_json) : null);
}

function requireDatabase() {
  if (!hasCompanionLocalDatabase(getCompanionRuntimeCapability())) {
    throw new Error('Learning settings require a local companion database.');
  }
}

export async function loadCompanionReviewSettings() {
  requireDatabase();
  const settings = await readIosCompanionDatabase(readSettings);
  hydrateCurrentReviewSchedulerSettings(settings);
  return settings;
}

export async function saveCompanionReviewSettings(patch: ReviewSchedulerSettingsSavePatch) {
  requireDatabase();
  return runCompanionSyncMutationTask(async () => {
    const settings = await writeIosCompanionDatabase(db => db.transaction(async tx => {
      const next = mergeReviewSchedulerSettingsPatch(await readSettings(tx), {
        ...patch, updatedAt: new Date().toISOString()
      });
      await saveIosSettingWithDb(tx, { key: KEY, scope: 'user_space', value_json: JSON.stringify(next) });
      return next;
    }));
    hydrateCurrentReviewSchedulerSettings(settings);
    return settings;
  }, { kind: 'nodes', nodeIds: [] });
}
