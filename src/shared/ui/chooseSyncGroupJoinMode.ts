import { parseSyncGroupJoinMode, type SyncGroupJoinMode } from '../../../lib/platform/syncGroupJoinMode';
import type { Translate } from '../localization/LocalizationProvider';

import { requestAppChoice } from './appChoice';
import { requestAppConfirmation, requestAppTextInput } from './appConfirmation';

export async function chooseSyncGroupJoinMode(
  t: Translate, groupName: string, { allowOverwrite = true } = {}
): Promise<SyncGroupJoinMode | null> {
  const useGroup = { value: 'use-group', label: t('syncGroup.join.mode.useGroup'), tone: 'primary' as const };
  const choice = await requestAppChoice({
    title: t('syncGroup.join.mode.title'),
    ...(allowOverwrite ? {
      description: t('syncGroup.join.mode.description'),
      moreLabel: t('syncGroup.join.mode.more'),
      choices: [useGroup, { value: 'overwrite', label: t('syncGroup.join.mode.overwrite'), tone: 'danger' as const }]
    } : { description: t('syncGroup.join.mode.useGroupOnlyDescription'), choices: [useGroup] })
  });
  const mode = choice === null ? null : parseSyncGroupJoinMode(choice);
  if (mode !== 'overwrite') return mode;
  return await confirmGroupOverwrite(t, groupName) ? mode : null;
}

async function confirmGroupOverwrite(t: Translate, groupName: string) {
  const first = await requestAppConfirmation({
    title: t('syncGroup.join.overwrite.confirmTitle'),
    description: t('syncGroup.join.overwrite.confirmDescription')
  });
  if (!first) return false;
  const typed = await requestAppTextInput({
    title: t('syncGroup.join.overwrite.finalTitle'),
    description: [t('syncGroup.join.overwrite.finalDescription'), t('syncGroup.join.overwrite.finalWarning'),
      t('syncGroup.join.overwrite.typeName', { name: groupName })],
    inputLabel: t('syncGroup.join.overwrite.typeNameLabel'),
    placeholder: groupName,
    requiredValue: groupName,
    confirmLabel: t('syncGroup.join.overwrite.finalConfirm')
  });
  return typed !== null;
}
