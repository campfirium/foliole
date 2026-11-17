import { HELP_KNOWLEDGE_ITEMS, queryHelpKnowledge } from '../../features/help/model/helpKnowledge';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { translate } from '../../shared/localization/translations';
import { localizeActionHelpCopy } from '../../shared/ui/actionHelpLocalization';

import type { PaletteSection } from './CommandPaletteList';

const englishTips = HELP_KNOWLEDGE_ITEMS.map((item) =>
  localizeActionHelpCopy((key) => translate('en', key), item)
);

export function buildPaletteActionHelpSection(query: string, t: Translate): PaletteSection | null {
  if (!query.trim()) return null;
  const tips = HELP_KNOWLEDGE_ITEMS.map((item) => localizeActionHelpCopy(t, item));
  const matchedIds = new Set(
    [...queryHelpKnowledge(query, tips), ...queryHelpKnowledge(query, englishTips)].map(({ id }) => id)
  );
  const matches = tips.filter(({ id }) => matchedIds.has(id));
  if (!matches.length) return null;

  return {
    id: 'action-tips',
    title: t('desktop.palette.command.actionTips'),
    items: matches.map((tip) => ({
      id: tip.id,
      title: tip.title,
      enabled: true,
      tip
    }))
  };
}
