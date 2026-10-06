import { parseSyncGroupJoinMode, type SyncGroupJoinMode } from '../../../lib/platform/syncGroupJoinMode';
import type { Translate } from '../localization/LocalizationProvider';

import { requestAppChoice } from './appChoice';

export async function chooseSyncGroupJoinMode(t: Translate): Promise<SyncGroupJoinMode | null> {
  const choice = await requestAppChoice({
    title: t('syncGroup.join.mode.title'),
    description: t('syncGroup.join.mode.description'),
    choices: [
      { value: 'use-group', label: t('syncGroup.join.mode.useGroup') },
      { value: 'overwrite', label: t('syncGroup.join.mode.overwrite') }
    ]
  });
  return choice === null ? null : parseSyncGroupJoinMode(choice);
}
