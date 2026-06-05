import type { Translate } from '../localization/LocalizationProvider';
import type { TranslationKey } from '../localization/translations';

import type { ActionHelpCardCopy } from './ActionHelpCard';

export type LocalizableActionHelpCopy = ActionHelpCardCopy & {
  id?: string;
  keywords?: string[];
  sourceLabel?: string;
};

function actionHelpKey(help: LocalizableActionHelpCopy, field: 'body' | 'detail' | 'sourceLabel' | 'title') {
  return help.id ? (`desktop.${help.id}.${field}` as TranslationKey) : null;
}

export function localizeActionHelpCopy<T extends LocalizableActionHelpCopy>(t: Translate, help: T): T {
  const titleKey = actionHelpKey(help, 'title');
  const bodyKey = actionHelpKey(help, 'body');
  const detailKey = help.detail ? actionHelpKey(help, 'detail') : null;
  const sourceLabelKey = help.sourceLabel ? actionHelpKey(help, 'sourceLabel') : null;

  return {
    ...help,
    ...(titleKey ? { title: t(titleKey) } : {}),
    ...(bodyKey ? { body: t(bodyKey) } : {}),
    ...(detailKey ? { detail: t(detailKey) } : {}),
    ...(sourceLabelKey ? { sourceLabel: t(sourceLabelKey) } : {})
  };
}
