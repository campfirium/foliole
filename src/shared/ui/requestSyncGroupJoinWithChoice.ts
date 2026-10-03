import { SYNC_GROUP_MERGE_REQUIRES_OVERWRITE } from '../../../lib/platform/syncGroupJoinMergeProof';
import type { SyncGroupJoinMode } from '../../../lib/platform/syncGroupJoinMode';
import type { Translate } from '../localization/LocalizationProvider';

import { requestAppChoice } from './appChoice';

export async function requestSyncGroupJoinWithChoice<T>(
  t: Translate, mode: SyncGroupJoinMode, request: (mode: SyncGroupJoinMode) => Promise<T>
): Promise<T | null> {
  try { return await request(mode); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (mode !== 'merge' || !message.endsWith(SYNC_GROUP_MERGE_REQUIRES_OVERWRITE)) throw error;
    const choice = await requestAppChoice({
      title: t('syncGroup.join.restoreProtection.title'),
      description: t('syncGroup.join.restoreProtection.description'),
      choices: [{ value: 'overwrite', label: t('syncGroup.join.mode.overwrite') }]
    });
    return choice === 'overwrite' ? request('overwrite') : null;
  }
}
