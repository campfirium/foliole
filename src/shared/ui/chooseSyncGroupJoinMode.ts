import { parseSyncGroupJoinMode, type SyncGroupJoinMode } from '../../../lib/platform/syncGroupJoinMode';
import type { Translate } from '../localization/LocalizationProvider';

import { requestAppChoice } from './appChoice';
import { requestAppConfirmation } from './appConfirmation';

export async function chooseSyncGroupJoinMode(t: Translate): Promise<SyncGroupJoinMode | null> {
  const choice = await requestAppChoice({
    title: t('syncGroup.join.mode.title'),
    description: t('syncGroup.join.mode.description'),
    choices: [
      { value: 'use-group', label: t('syncGroup.join.mode.useGroup') },
      { value: 'overwrite', label: t('syncGroup.join.mode.overwrite') }
    ]
  });
  const mode = choice === null ? null : parseSyncGroupJoinMode(choice);
  if (mode !== 'overwrite') return mode;
  return await confirmGroupOverwrite(t) ? mode : null;
}

async function confirmGroupOverwrite(t: Translate) {
  const first = await requestAppConfirmation({
    title: t('syncGroup.join.overwrite.confirmTitle'),
    description: t('syncGroup.join.overwrite.confirmDescription'),
    cancelLabel: t('syncGroup.join.overwrite.no'),
    confirmLabel: t('syncGroup.join.overwrite.yes')
  });
  if (!first) return false;
  return requestAppConfirmation({
    title: t('syncGroup.join.overwrite.finalTitle'),
    description: [t('syncGroup.join.overwrite.finalDescription'), t('syncGroup.join.overwrite.finalWarning')],
    cancelLabel: t('syncGroup.join.overwrite.no'),
    confirmLabel: t('syncGroup.join.overwrite.finalConfirm')
  });
}
